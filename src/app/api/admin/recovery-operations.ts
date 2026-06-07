import { randomUUID } from "node:crypto";
import { apiError, apiSuccess } from "@/app/api/envelope";
import { buildAuditLog } from "@/domain/admin/audit";
import { canDisableConversation, canDisableUser } from "@/domain/admin/moderation-admin";
import { createClaimToken } from "@/domain/claims/claim-token";
import { createChingAdapter } from "@/domain/payments/ching-adapter";
import {
  buildPaymentRecoveryAudit,
  buildPaymentRecoveryPayload,
  canCreateReplacementCheckout,
} from "@/domain/payments/recovery";
import type { PaymentProductKey } from "@/domain/payments/products";
import type { PaymentStatus } from "@/domain/payments/types";
import { createFallbackReportOutput } from "@/domain/reports/fallback-output";
import { assembleReportPrompt } from "@/domain/reports/prompt";
import { canRetryReport, selectRetryPromptVersion, type ReportRetryMode } from "@/domain/reports/retry";
import { validateReportOutput } from "@/domain/reports/report-output";
import { createServiceRoleClient } from "@/lib/supabase/admin";

type PaymentRow = {
  id: string;
  quiz_session_id: string | null;
  user_id: string | null;
  product_key: PaymentProductKey;
  provider: string;
  provider_reference: string;
  status: PaymentStatus;
  amount_minor: number;
  currency: "ILS";
  raw_payload: Record<string, unknown> | null;
  created_at?: string;
};

type ReportRow = {
  id: string;
  quiz_session_id: string;
  status: "pending" | "generating" | "completed" | "failed";
  prompt_version_id: string;
  archetype_version_id: string | null;
  input_snapshot: { answers?: { question: string; answer: string }[] } | null;
};

type PromptRow = {
  id: string;
  template: string;
  model: string;
  model_settings: Record<string, unknown> | null;
};

type ModerationMessageRow = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export async function listPayments() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("payments")
    .select("id, quiz_session_id, user_id, product_key, provider, provider_reference, status, amount_minor, currency, raw_payload, created_at")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<PaymentRow[]>();
  return error ? schemaUnavailable("ניהול התשלומים אינו זמין כרגע.") : apiSuccess({ payments: data ?? [] });
}

export async function reconcilePayment(actorUserId: string, paymentId: string) {
  const payment = await loadPayment(paymentId);
  if (payment instanceof Response) return payment;
  if (payment.status === "paid") return invalidState("payment_not_recoverable", "אי אפשר לשחזר תשלום שכבר שולם.");

  const rawPayload = normalizeRawPayload(payment.raw_payload);
  const customerId = typeof rawPayload.customerId === "string" ? rawPayload.customerId : "";
  if (!customerId) return validationFailed("לא שמור מזהה לקוח של CHING לתשלום הזה.");

  const adapter = createChingAdapter();
  if (!adapter.getChargesByCustomer) return schemaUnavailable("בדיקת תשלומי CHING אינה זמינה כרגע.");

  const response = await adapter.getChargesByCustomer(customerId);
  const now = new Date().toISOString();
  const oldStatus = payment.status;
  const nextStatus = inferRecoverableStatusFromReconciliation(response) ?? payment.status;
  const reconciliationPayloads = Array.isArray(rawPayload.reconciliationPayloads)
    ? rawPayload.reconciliationPayloads
    : [];
  const nextRawPayload = appendRecoveryAction(
    {
      ...rawPayload,
      reconciliationPayloads: [...reconciliationPayloads, { at: now, customerId, response }],
    },
    buildPaymentRecoveryPayload({
      action: "payment.reconcile",
      actorUserId,
      paymentId: payment.id,
      oldStatus,
      newStatus: nextStatus,
      reason: "Provider reconciliation",
      at: now,
    }),
  );

  const update = await updatePayment(payment.id, { status: nextStatus, raw_payload: nextRawPayload, updated_at: now });
  if (update) return update;
  if ((nextStatus === "failed" || nextStatus === "cancelled") && payment.quiz_session_id) {
    const reopen = await updateQuizSession(payment.quiz_session_id, "completed", now);
    if (reopen) return reopen;
  }

  const audit = await insertPaymentAudit({
    action: "payment.reconcile",
    actorUserId,
    paymentId: payment.id,
    oldStatus,
    newStatus: nextStatus,
    reason: "Provider reconciliation",
  });
  return audit ?? apiSuccess({ paymentId: payment.id, status: nextStatus });
}

export async function markPaymentFailed(actorUserId: string, paymentId: string, body: unknown) {
  const payment = await loadPayment(paymentId);
  if (payment instanceof Response) return payment;
  if (payment.status === "paid") return invalidState("payment_not_recoverable", "אי אפשר לשחזר תשלום שכבר שולם.");
  if (payment.status !== "created" && payment.status !== "pending") {
    return invalidState("payment_invalid_state", "אפשר לסמן כנכשל רק תשלום שנוצר או ממתין.");
  }
  return updatePaymentRecoveryStatus(payment, actorUserId, "payment.mark_failed", "failed", readReason(body));
}

export async function markPaymentCancelled(actorUserId: string, paymentId: string, body: unknown) {
  const payment = await loadPayment(paymentId);
  if (payment instanceof Response) return payment;
  if (payment.status === "paid") return invalidState("payment_not_recoverable", "אי אפשר לשחזר תשלום שכבר שולם.");
  if (payment.status !== "created" && payment.status !== "pending" && payment.status !== "failed") {
    return invalidState("payment_invalid_state", "אפשר לבטל רק תשלום שנוצר, ממתין או נכשל.");
  }
  return updatePaymentRecoveryStatus(payment, actorUserId, "payment.mark_cancelled", "cancelled", readReason(body));
}

export async function createReplacementCheckout(actorUserId: string, paymentId: string) {
  const payment = await loadPayment(paymentId);
  if (payment instanceof Response) return payment;
  if (payment.status === "paid") return invalidState("payment_not_recoverable", "אי אפשר לשחזר תשלום שכבר שולם.");
  if (!canCreateReplacementCheckout(payment)) {
    return invalidState("payment_invalid_state", "אפשר ליצור תשלום חלופי רק לתשלום שנכשל או בוטל.");
  }

  const activeReplacement = await getActiveReplacementCheckout(payment);
  if (activeReplacement instanceof Response) return activeReplacement;
  if (activeReplacement?.redirectUrl) {
    return apiSuccess({ paymentId: activeReplacement.id, redirectUrl: activeReplacement.redirectUrl, reused: true });
  }

  const supabase = createServiceRoleClient();
  const providerReference = `ching-${randomUUID()}`;
  const { data: inserted, error: insertError } = await supabase
    .from("payments")
    .insert({
      quiz_session_id: payment.quiz_session_id,
      user_id: payment.user_id,
      product_key: payment.product_key,
      provider: "ching",
      provider_reference: providerReference,
      status: "created",
      amount_minor: payment.amount_minor,
      currency: payment.currency,
      raw_payload: { replacementForPaymentId: payment.id },
    })
    .select("id, provider_reference")
    .single<{ id: string; provider_reference: string }>();
  if (insertError || !inserted) return schemaUnavailable("אי אפשר ליצור תשלום חלופי כרגע.");

  const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const notifyUrl = new URL(`${baseUrl}/api/payments/ching/webhook`);
  notifyUrl.searchParams.set("payment", inserted.id);
  const created = await createChingAdapter().createPayment({
    paymentId: inserted.id,
    quizSessionId: payment.quiz_session_id ?? undefined,
    amountMinor: payment.amount_minor,
    currency: payment.currency,
    notifyUrl: notifyUrl.toString(),
    successUrl: `${baseUrl}/payment/return?payment=${encodeURIComponent(inserted.id)}`,
    failureUrl: `${baseUrl}/payment/return?payment=${encodeURIComponent(inserted.id)}&cancelled=1`,
    itemName: payment.product_key === "matching_unlock" ? "פתיחת התאמות וצ'אט" : "דוח עומק זוגי",
  });
  const now = new Date().toISOString();
  const replacementUpdate = await updatePayment(inserted.id, {
    provider_reference: created.providerReference,
    status: "pending",
    raw_payload: {
      replacementForPaymentId: payment.id,
      ...(created.customerId ? { customerId: created.customerId } : {}),
      checkoutRequest: created.checkoutRequest ?? null,
      checkoutResponse: created.checkoutResponse ?? null,
      redirectUrl: created.redirectUrl,
    },
    updated_at: now,
  });
  if (replacementUpdate) return replacementUpdate;

  const originalUpdate = await updatePayment(payment.id, {
    raw_payload: appendRecoveryAction(
      { ...normalizeRawPayload(payment.raw_payload), replacedByPaymentId: inserted.id },
      buildPaymentRecoveryPayload({
        action: "payment.create_replacement",
        actorUserId,
        paymentId: payment.id,
        oldStatus: payment.status,
        newStatus: payment.status,
        reason: "Replacement checkout created",
        at: now,
        replacementPaymentId: inserted.id,
      }),
    ),
    updated_at: now,
  });
  if (originalUpdate) return originalUpdate;
  if (payment.quiz_session_id) {
    const sessionUpdate = await updateQuizSession(payment.quiz_session_id, "payment_pending", now);
    if (sessionUpdate) return sessionUpdate;
  }

  const audit = await insertPaymentAudit({
    action: "payment.create_replacement",
    actorUserId,
    paymentId: payment.id,
    oldStatus: payment.status,
    newStatus: payment.status,
    reason: "Replacement checkout created",
    replacementPaymentId: inserted.id,
  });
  return audit ?? apiSuccess({ paymentId: inserted.id, redirectUrl: created.redirectUrl, reused: false });
}

export async function listReports() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("reports")
    .select("id, report_number, status, error_message, prompt_version_id, created_at")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<ReportRow[]>();
  return error ? schemaUnavailable("ניהול הדוחות אינו זמין כרגע.") : apiSuccess({ reports: data ?? [] });
}

export async function retryReport(actorUserId: string, reportId: string, body: unknown) {
  const mode = readRecord(body).mode === "latest" ? "latest" : "original";
  const supabase = createServiceRoleClient();
  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("id, quiz_session_id, status, prompt_version_id, archetype_version_id, input_snapshot")
    .eq("id", reportId)
    .maybeSingle<ReportRow>();
  if (reportError) return schemaUnavailable("אי אפשר לטעון את הדוח כרגע.");
  if (!report) return apiError({ status: 404, code: "not_found", message: "הדוח לא נמצא." });
  if (!canRetryReport({ status: report.status })) {
    return invalidState("report_not_retryable", "אפשר להריץ מחדש רק דוח שנכשל.");
  }

  const originalPrompt = await getPromptVersion(report.prompt_version_id);
  if (originalPrompt instanceof Response) return originalPrompt;
  const latestPrompt = mode === "latest" ? await getLatestPaidReportPrompt() : originalPrompt;
  if (latestPrompt instanceof Response) return latestPrompt;
  const promptVersionId = selectRetryPromptVersion({
    mode: mode as ReportRetryMode,
    originalPromptVersionId: originalPrompt.id,
    latestPromptVersionId: latestPrompt.id,
  });
  const prompt = promptVersionId === latestPrompt.id ? latestPrompt : originalPrompt;
  const answers = report.input_snapshot?.answers ?? [];
  const assembledPrompt = assembleReportPrompt({
    template: prompt.template,
    displayName: "guest",
    archetypeName: "Relationship pattern",
    answers,
  });
  const now = new Date().toISOString();

  const { error: generatingError } = await supabase
    .from("reports")
    .update({
      status: "generating",
      prompt_version_id: prompt.id,
      input_snapshot: {
        prompt: assembledPrompt,
        promptVersionId: prompt.id,
        archetypeVersionId: report.archetype_version_id,
        answers,
        model: prompt.model,
        modelSettings: prompt.model_settings ?? {},
      },
      output: {},
      error_message: null,
      updated_at: now,
    })
    .eq("id", report.id);
  if (generatingError) return schemaUnavailable("אי אפשר להתחיל יצירת דוח כרגע.");

  const audit = await insertAudit(
    buildAuditLog({
      actorUserId,
      action: "report.retry",
      targetTable: "reports",
      targetId: report.id,
      metadata: { mode, promptVersionId: prompt.id },
    }),
  );
  if (audit) return audit;

  const output = validateReportOutput(createFallbackReportOutput());
  const { error: completeError } = await supabase
    .from("reports")
    .update({ status: "completed", output, updated_at: new Date().toISOString() })
    .eq("id", report.id);
  if (completeError) return schemaUnavailable("הדוח נוצר אבל שמירת התוצאה נכשלה.");
  await ensureClaimToken(report.quiz_session_id, report.id);
  return apiSuccess({ reportId: report.id });
}

export async function listUsers() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, display_name, birth_year, gender, interested_in, disabled_at, created_at, completed_depth_questionnaire_at")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<Record<string, unknown>[]>();
  return error ? schemaUnavailable("ניהול המשתמשים אינו זמין כרגע.") : apiSuccess({ users: data ?? [] });
}

export async function getUser(userId: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) return schemaUnavailable("ניהול המשתמשים אינו זמין כרגע.");
  return data ? apiSuccess({ user: data }) : apiError({ status: 404, code: "not_found", message: "המשתמש לא נמצא." });
}

export async function disableUser(actorUserId: string, userId: string) {
  const profile = await loadUserProfile(userId);
  if (profile instanceof Response) return profile;
  if (!canDisableUser({ disabledAt: readDisabledAt(profile.disabled_at) })) {
    return invalidState("user_already_disabled", "המשתמש כבר חסום.");
  }
  const disabledAt = new Date().toISOString();
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("profiles").update({ disabled_at: disabledAt }).eq("user_id", userId);
  if (error) return schemaUnavailable("אי אפשר לחסום את המשתמש כרגע.");
  const audit = await insertAudit(buildAuditLog({ actorUserId, action: "users.disable", targetTable: "profiles", targetId: userId }));
  return audit ?? apiSuccess({ userId });
}

export async function enableUser(actorUserId: string, userId: string) {
  const profile = await loadUserProfile(userId);
  if (profile instanceof Response) return profile;
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("profiles").update({ disabled_at: null }).eq("user_id", userId);
  if (error) return schemaUnavailable("אי אפשר להפעיל את המשתמש כרגע.");
  const audit = await insertAudit(buildAuditLog({ actorUserId, action: "users.enable", targetTable: "profiles", targetId: userId }));
  return audit ?? apiSuccess({ userId });
}

export async function listModerationReports() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("user_reports")
    .select("id, reporter_id, reported_user_id, conversation_id, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<Record<string, unknown>[]>();
  return error ? schemaUnavailable("ניהול המודרציה אינו זמין כרגע.") : apiSuccess({ reports: data ?? [] });
}

export async function disableConversation(actorUserId: string, conversationId: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, status")
    .eq("id", conversationId)
    .maybeSingle<{ id: string; status: "active" | "blocked" | "disabled" }>();
  if (error) return schemaUnavailable("ניהול השיחות אינו זמין כרגע.");
  if (!data) return apiError({ status: 404, code: "not_found", message: "השיחה לא נמצאה." });
  if (!canDisableConversation(data)) {
    return invalidState("conversation_already_disabled", "השיחה כבר מושבתת.");
  }
  const { error: updateError } = await supabase
    .from("conversations")
    .update({ status: "disabled", updated_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (updateError) return schemaUnavailable("אי אפשר להשבית את השיחה כרגע.");
  const audit = await insertAudit(
    buildAuditLog({
      actorUserId,
      action: "moderation.conversation.disable",
      targetTable: "conversations",
      targetId: conversationId,
    }),
  );
  return audit ?? apiSuccess({ conversationId });
}

export async function listModerationConversationMessages(
  actorUserId: string,
  conversationId: string,
  reportId: string | null,
) {
  const supabase = createServiceRoleClient();
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle<{ id: string }>();
  if (conversationError) return schemaUnavailable("ניהול השיחות אינו זמין כרגע.");
  if (!conversation) return apiError({ status: 404, code: "not_found", message: "השיחה לא נמצאה." });

  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .returns<ModerationMessageRow[]>();
  if (error) return schemaUnavailable("אי אפשר לטעון את הודעות השיחה כרגע.");

  const messages = (data ?? []).map((message) => ({
    id: message.id,
    senderId: message.sender_id,
    body: message.body,
    createdAt: message.created_at,
  }));
  const audit = await insertAudit(
    buildAuditLog({
      actorUserId,
      action: "moderation.messages.view",
      targetTable: "conversations",
      targetId: conversationId,
      metadata: { reportId, messageCount: messages.length },
    }),
  );

  return audit ?? apiSuccess({ messages });
}

async function updatePaymentRecoveryStatus(
  payment: PaymentRow,
  actorUserId: string,
  action: "payment.mark_failed" | "payment.mark_cancelled",
  nextStatus: PaymentStatus,
  reasonResult: string | Response,
) {
  if (reasonResult instanceof Response) return reasonResult;
  const now = new Date().toISOString();
  const oldStatus = payment.status;
  const update = await updatePayment(payment.id, {
    status: nextStatus,
    raw_payload: appendRecoveryAction(
      normalizeRawPayload(payment.raw_payload),
      buildPaymentRecoveryPayload({
        action,
        actorUserId,
        paymentId: payment.id,
        oldStatus,
        newStatus: nextStatus,
        reason: reasonResult,
        at: now,
      }),
    ),
    updated_at: now,
  });
  if (update) return update;
  if (payment.quiz_session_id) {
    const session = await updateQuizSession(payment.quiz_session_id, "completed", now);
    if (session) return session;
  }
  const audit = await insertPaymentAudit({ action, actorUserId, paymentId: payment.id, oldStatus, newStatus: nextStatus, reason: reasonResult });
  return audit ?? apiSuccess({ paymentId: payment.id, status: nextStatus });
}

async function loadPayment(paymentId: string): Promise<PaymentRow | Response> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("payments")
    .select("id, quiz_session_id, user_id, product_key, provider, provider_reference, status, amount_minor, currency, raw_payload, created_at")
    .eq("id", paymentId)
    .maybeSingle<PaymentRow>();
  if (error) return schemaUnavailable("ניהול התשלומים אינו זמין כרגע.");
  return data ?? apiError({ status: 404, code: "not_found", message: "התשלום לא נמצא." });
}

async function updatePayment(paymentId: string, payload: Record<string, unknown>) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("payments").update(payload).eq("id", paymentId);
  return error ? schemaUnavailable("אי אפשר לעדכן את התשלום כרגע.") : null;
}

async function updateQuizSession(sessionId: string, status: string, now: string) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("quiz_sessions").update({ status, updated_at: now }).eq("id", sessionId);
  return error ? schemaUnavailable("אי אפשר לעדכן את שאלון המשתמש כרגע.") : null;
}

async function getActiveReplacementCheckout(payment: PaymentRow) {
  const supabase = createServiceRoleClient();
  let query = supabase
    .from("payments")
    .select("id, raw_payload")
    .eq("product_key", payment.product_key)
    .in("status", ["created", "pending"])
    .order("created_at", { ascending: false })
    .limit(20);
  query = payment.quiz_session_id ? query.eq("quiz_session_id", payment.quiz_session_id) : query.eq("user_id", payment.user_id ?? "");
  const { data, error } = await query;
  if (error) return schemaUnavailable("אי אפשר לבדוק תשלומים חלופיים כרגע.");
  const replacement = ((data ?? []) as { id: string; raw_payload: Record<string, unknown> | null }[]).find(
    (row) => normalizeRawPayload(row.raw_payload).replacementForPaymentId === payment.id,
  );
  const rawPayload = normalizeRawPayload(replacement?.raw_payload);
  return replacement
    ? { id: replacement.id, redirectUrl: typeof rawPayload.redirectUrl === "string" ? rawPayload.redirectUrl : null }
    : null;
}

async function getPromptVersion(id: string): Promise<PromptRow | Response> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.from("prompt_versions").select("id, template, model, model_settings").eq("id", id).maybeSingle<PromptRow>();
  if (error) return schemaUnavailable("אי אפשר לטעון את הפרומפט כרגע.");
  return data ?? apiError({ status: 404, code: "not_found", message: "גרסת הפרומפט לא נמצאה." });
}

async function getLatestPaidReportPrompt(): Promise<PromptRow | Response> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("prompt_versions")
    .select("id, template, model, model_settings")
    .eq("slug", "paid-report-v1")
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<PromptRow>();
  if (error) return schemaUnavailable("אי אפשר לטעון את הפרומפט האחרון כרגע.");
  return data ?? apiError({ status: 404, code: "not_found", message: "לא נמצאה גרסת פרומפט מפורסמת." });
}

async function ensureClaimToken(quizSessionId: string, reportId: string) {
  const supabase = createServiceRoleClient();
  const { data: existing, error } = await supabase
    .from("registration_claim_tokens")
    .select("id")
    .eq("report_id", reportId)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (error || existing) return;
  const token = await createClaimToken();
  await supabase.from("registration_claim_tokens").insert({
    quiz_session_id: quizSessionId,
    report_id: reportId,
    token_hash: token.tokenHash,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
}

async function loadUserProfile(userId: string): Promise<Record<string, unknown> | Response> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle<Record<string, unknown>>();
  if (error) return schemaUnavailable("ניהול המשתמשים אינו זמין כרגע.");
  return data ?? apiError({ status: 404, code: "not_found", message: "המשתמש לא נמצא." });
}

async function insertPaymentAudit(input: Parameters<typeof buildPaymentRecoveryAudit>[0]) {
  return insertAudit(buildPaymentRecoveryAudit(input));
}

async function insertAudit(row: Record<string, unknown>) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("admin_audit_logs").insert(row);
  return error ? schemaUnavailable("הפעולה הצליחה אבל רישום הביקורת נכשל.") : null;
}

function readReason(body: unknown) {
  const reason = readRecord(body).reason;
  return typeof reason === "string" && reason.trim() ? reason.trim() : validationFailed("חובה לציין סיבה.");
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readDisabledAt(value: unknown) {
  return typeof value === "string" && value ? new Date(value) : null;
}

function appendRecoveryAction(rawPayload: Record<string, unknown>, action: ReturnType<typeof buildPaymentRecoveryPayload>) {
  const recoveryActions = Array.isArray(rawPayload.recoveryActions) ? rawPayload.recoveryActions : [];
  return { ...rawPayload, recoveryActions: [...recoveryActions, action] };
}

function normalizeRawPayload(rawPayload: Record<string, unknown> | null | undefined) {
  return rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload) ? rawPayload : {};
}

function inferRecoverableStatusFromReconciliation(response: unknown): PaymentStatus | null {
  const statuses = collectStatusStrings(response);
  if (statuses.some((status) => ["cancelled", "canceled", "cancel"].includes(status))) return "cancelled";
  if (statuses.some((status) => ["failed", "failure", "fail", "declined", "error"].includes(status))) return "failed";
  return null;
}

function collectStatusStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => collectStatusStrings(item));
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return Object.entries(record).flatMap(([key, item]) => {
    const direct =
      typeof item === "string" && ["status", "transactionstatus", "transaction_status", "paymentstatus", "payment_status"].includes(key.toLowerCase())
        ? [item.trim().toLowerCase()]
        : [];
    return [...direct, ...(typeof item === "object" && item !== null ? collectStatusStrings(item) : [])];
  });
}

function validationFailed(message: string) {
  return apiError({ status: 400, code: "validation_failed", message });
}

function invalidState(code: string, message: string) {
  return apiError({ status: 409, code, message });
}

function schemaUnavailable(message: string) {
  return apiError({ status: 503, code: "schema_unavailable", message });
}
