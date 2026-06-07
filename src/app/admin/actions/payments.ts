"use server";

import { randomUUID } from "node:crypto";
import {
  buildPaymentRecoveryAudit,
  buildPaymentRecoveryPayload,
  canCreateReplacementCheckout,
} from "@/domain/payments/recovery";
import type { PaymentProductKey } from "@/domain/payments/products";
import type { PaymentStatus } from "@/domain/payments/types";
import { createChingAdapter } from "@/domain/payments/ching-adapter";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { requireAdminActionActor } from "./guard";

const REPORT_PRICE_MINOR = 9900;

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

type ReplacementResult = {
  paymentId: string;
  redirectUrl: string;
  reused: boolean;
};

export async function reconcilePaymentAction(formData: FormData) {
  const actor = await requireAdminActionActor();
  const payment = await getPaymentFromForm(formData);
  assertNotPaid(payment);

  const oldStatus = payment.status;
  const rawPayload = normalizeRawPayload(payment.raw_payload);
  const customerId = typeof rawPayload.customerId === "string" ? rawPayload.customerId : null;
  if (!customerId) {
    throw new Error("No CHING customer is stored for this payment");
  }

  const adapter = createChingAdapter();
  if (!adapter.getChargesByCustomer) {
    throw new Error("CHING charge lookup is unavailable");
  }

  const response = await adapter.getChargesByCustomer(customerId);
  const now = new Date().toISOString();
  const nextStatus = inferRecoverableStatusFromReconciliation(response) ?? payment.status;
  const reconciliationPayloads = Array.isArray(rawPayload.reconciliationPayloads)
    ? rawPayload.reconciliationPayloads
    : [];
  const nextRawPayload = appendRecoveryAction(
    {
      ...rawPayload,
      reconciliationPayloads: [
        ...reconciliationPayloads,
        {
          at: now,
          customerId,
          response,
        },
      ],
    },
    buildPaymentRecoveryPayload({
      action: "payment.reconcile",
      actorUserId: actor.userId,
      paymentId: payment.id,
      oldStatus,
      newStatus: nextStatus,
      reason: "Provider reconciliation",
      at: now,
    }),
  );

  const supabase = createServiceRoleClient();
  const { error: updateError } = await supabase
    .from("payments")
    .update({
      status: nextStatus,
      raw_payload: nextRawPayload,
      updated_at: now,
    })
    .eq("id", payment.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  if (nextStatus === "failed" || nextStatus === "cancelled") {
    if (payment.quiz_session_id) {
      await reopenQuizSession(payment.quiz_session_id, now);
    }
  }

  await insertRecoveryAudit({
    action: "payment.reconcile",
    actorUserId: actor.userId,
    paymentId: payment.id,
    oldStatus,
    newStatus: nextStatus,
    reason: "Provider reconciliation",
  });

  revalidatePath("/admin/payments");
}

export async function markPaymentFailedAction(formData: FormData) {
  const actor = await requireAdminActionActor();
  const payment = await getPaymentFromForm(formData);
  assertNotPaid(payment);

  if (payment.status !== "created" && payment.status !== "pending") {
    throw new Error("Only created or pending payments can be marked failed");
  }

  const reason = getRequiredReason(formData);
  await updatePaymentRecoveryStatus({
    payment,
    actorUserId: actor.userId,
    action: "payment.mark_failed",
    nextStatus: "failed",
    reason,
  });
}

export async function markPaymentCancelledAction(formData: FormData) {
  const actor = await requireAdminActionActor();
  const payment = await getPaymentFromForm(formData);
  assertNotPaid(payment);

  if (payment.status !== "created" && payment.status !== "pending" && payment.status !== "failed") {
    throw new Error("Only created, pending, or failed payments can be marked cancelled");
  }

  const reason = getRequiredReason(formData);
  await updatePaymentRecoveryStatus({
    payment,
    actorUserId: actor.userId,
    action: "payment.mark_cancelled",
    nextStatus: "cancelled",
    reason,
  });
}

export async function createReplacementCheckoutAction(formData: FormData): Promise<ReplacementResult> {
  const actor = await requireAdminActionActor();
  const payment = await getPaymentFromForm(formData);
  assertNotPaid(payment);

  if (!canCreateReplacementCheckout(payment)) {
    throw new Error("Only failed or cancelled payments can be replaced");
  }

  const activeReplacement = await getActiveReplacementCheckout(payment);
  if (activeReplacement?.redirectUrl) {
    return {
      paymentId: activeReplacement.id,
      redirectUrl: activeReplacement.redirectUrl,
      reused: true,
    };
  }

  const supabase = createServiceRoleClient();
  const oldStatus = payment.status;
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
      raw_payload: {
        replacementForPaymentId: payment.id,
      },
    })
    .select("id, provider_reference")
    .single<{ id: string; provider_reference: string }>();

  if (insertError) {
    throw new Error(insertError.message);
  }

  const baseUrl = getAppBaseUrl();
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
  const replacementRawPayload = {
    replacementForPaymentId: payment.id,
    ...(created.customerId ? { customerId: created.customerId } : {}),
    checkoutRequest: created.checkoutRequest ?? null,
    checkoutResponse: created.checkoutResponse ?? null,
    redirectUrl: created.redirectUrl,
  };
  const { error: replacementUpdateError } = await supabase
    .from("payments")
    .update({
      provider_reference: created.providerReference,
      status: "pending",
      raw_payload: replacementRawPayload,
      updated_at: now,
    })
    .eq("id", inserted.id);

  if (replacementUpdateError) {
    throw new Error(replacementUpdateError.message);
  }

  const originalRawPayload = appendRecoveryAction(
    {
      ...normalizeRawPayload(payment.raw_payload),
      replacedByPaymentId: inserted.id,
    },
    buildPaymentRecoveryPayload({
      action: "payment.create_replacement",
      actorUserId: actor.userId,
      paymentId: payment.id,
      oldStatus,
      newStatus: oldStatus,
      reason: "Replacement checkout created",
      at: now,
      replacementPaymentId: inserted.id,
    }),
  );

  const { error: originalUpdateError } = await supabase
    .from("payments")
    .update({
      raw_payload: originalRawPayload,
      updated_at: now,
    })
    .eq("id", payment.id);

  if (originalUpdateError) {
    throw new Error(originalUpdateError.message);
  }

  if (payment.quiz_session_id) {
    await markSessionPaymentPending(payment.quiz_session_id, now);
  }
  await insertRecoveryAudit({
    action: "payment.create_replacement",
    actorUserId: actor.userId,
    paymentId: payment.id,
    oldStatus,
    newStatus: oldStatus,
    reason: "Replacement checkout created",
    replacementPaymentId: inserted.id,
  });

  revalidatePath("/admin/payments");

  return {
    paymentId: inserted.id,
    redirectUrl: created.redirectUrl,
    reused: false,
  };
}

export async function createReplacementCheckoutFormAction(formData: FormData) {
  await createReplacementCheckoutAction(formData);
}

export async function updatePaymentProductAction(formData: FormData) {
  await requireAdminActionActor();
  const productKey = String(formData.get("productKey") ?? "");
  if (productKey !== "paid_report" && productKey !== "matching_unlock") {
    throw new Error("Unknown payment product");
  }

  const amountMajor = Number(String(formData.get("amount") ?? "").trim());
  if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  const itemName = String(formData.get("itemName") ?? "").trim();
  if (!itemName) {
    throw new Error("Item name is required");
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("payment_products").upsert(
    {
      product_key: productKey,
      amount_minor: Math.round(amountMajor * 100),
      currency: "ILS",
      item_name: itemName,
      active: formData.get("active") === "on",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "product_key" },
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/payments");
}

async function updatePaymentRecoveryStatus(input: {
  payment: PaymentRow;
  actorUserId: string;
  action: "payment.mark_failed" | "payment.mark_cancelled";
  nextStatus: PaymentStatus;
  reason: string;
}) {
  const now = new Date().toISOString();
  const oldStatus = input.payment.status;
  const nextRawPayload = appendRecoveryAction(
    normalizeRawPayload(input.payment.raw_payload),
    buildPaymentRecoveryPayload({
      action: input.action,
      actorUserId: input.actorUserId,
      paymentId: input.payment.id,
      oldStatus,
      newStatus: input.nextStatus,
      reason: input.reason,
      at: now,
    }),
  );
  const supabase = createServiceRoleClient();
  const { error: updateError } = await supabase
    .from("payments")
    .update({
      status: input.nextStatus,
      raw_payload: nextRawPayload,
      updated_at: now,
    })
    .eq("id", input.payment.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  if (input.payment.quiz_session_id) {
    await reopenQuizSession(input.payment.quiz_session_id, now);
  }
  await insertRecoveryAudit({
    action: input.action,
    actorUserId: input.actorUserId,
    paymentId: input.payment.id,
    oldStatus,
    newStatus: input.nextStatus,
    reason: input.reason,
  });

  revalidatePath("/admin/payments");
}

async function getPaymentFromForm(formData: FormData): Promise<PaymentRow> {
  const paymentId = String(formData.get("paymentId") ?? "");
  if (!paymentId) {
    throw new Error("Payment id is required");
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("payments")
    .select("id, quiz_session_id, user_id, product_key, provider, provider_reference, status, amount_minor, currency, raw_payload, created_at")
    .eq("id", paymentId)
    .maybeSingle<PaymentRow>();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Payment was not found");
  }

  return data;
}

function getRequiredReason(formData: FormData) {
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) {
    throw new Error("Reason is required");
  }

  return reason;
}

function assertNotPaid(payment: PaymentRow) {
  if (payment.status === "paid") {
    throw new Error("Paid payments cannot be recovered");
  }
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

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? (data as { id: string; raw_payload: Record<string, unknown> | null }[]) : [];
  const replacement = rows.find((row) => {
    const rawPayload = normalizeRawPayload(row.raw_payload);
    return rawPayload.replacementForPaymentId === payment.id;
  });

  if (!replacement) {
    return null;
  }

  const rawPayload = normalizeRawPayload(replacement.raw_payload);
  return {
    id: replacement.id,
    redirectUrl: typeof rawPayload.redirectUrl === "string" ? rawPayload.redirectUrl : null,
  };
}

async function reopenQuizSession(sessionId: string, now: string) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("quiz_sessions")
    .update({ status: "completed", updated_at: now })
    .eq("id", sessionId);

  if (error) {
    throw new Error(error.message);
  }
}

async function markSessionPaymentPending(sessionId: string, now: string) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("quiz_sessions")
    .update({ status: "payment_pending", updated_at: now })
    .eq("id", sessionId);

  if (error) {
    throw new Error(error.message);
  }
}

async function insertRecoveryAudit(input: Parameters<typeof buildPaymentRecoveryAudit>[0]) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("admin_audit_logs").insert(buildPaymentRecoveryAudit(input));

  if (error) {
    throw new Error(error.message);
  }
}

function appendRecoveryAction(rawPayload: Record<string, unknown>, action: ReturnType<typeof buildPaymentRecoveryPayload>) {
  const recoveryActions = Array.isArray(rawPayload.recoveryActions) ? rawPayload.recoveryActions : [];
  return {
    ...rawPayload,
    recoveryActions: [...recoveryActions, action],
  };
}

function normalizeRawPayload(rawPayload: Record<string, unknown> | null | undefined) {
  return rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload) ? rawPayload : {};
}

function inferRecoverableStatusFromReconciliation(response: unknown): PaymentStatus | null {
  const statuses = collectStatusStrings(response);
  if (statuses.some((status) => ["cancelled", "canceled", "cancel"].includes(status))) {
    return "cancelled";
  }
  if (statuses.some((status) => ["failed", "failure", "fail", "declined", "error"].includes(status))) {
    return "failed";
  }

  return null;
}

function collectStatusStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStatusStrings(item));
  }
  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const direct = ["status", "transactionStatus", "transaction_status", "paymentStatus", "payment_status"].flatMap(
    (key) => {
      const item = record[key];
      return typeof item === "string" ? [item.trim().toLowerCase()] : [];
    },
  );

  return [
    ...direct,
    ...Object.values(record).flatMap((item) => (typeof item === "object" && item !== null ? collectStatusStrings(item) : [])),
  ];
}

function getAppBaseUrl() {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
