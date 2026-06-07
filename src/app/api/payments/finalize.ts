import OpenAI from "openai";
import { applyPaymentEvent } from "@/domain/payments/payment-state";
import type { PaymentProductKey } from "@/domain/payments/products";
import type { PaymentEvent, PaymentRecord } from "@/domain/payments/types";
import { createFallbackReportOutput } from "@/domain/reports/fallback-output";
import { generatePaidReport, createReportNumber, type ReportGenerationRepository } from "@/domain/reports/generation";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

type DbPayment = {
  id: string;
  quiz_session_id: string | null;
  user_id: string | null;
  product_key: PaymentProductKey | null;
  provider_reference: string;
  status: PaymentRecord["status"];
  amount_minor: number;
  currency: string;
  raw_payload: Record<string, unknown> | null;
};

export async function finalizePaymentById(paymentId: string, event?: PaymentEvent) {
  const supabase = createServiceRoleClient();
  const { data: payment, error } = await supabase
    .from("payments")
    .select("id, quiz_session_id, user_id, product_key, provider_reference, status, amount_minor, currency, raw_payload")
    .eq("id", paymentId)
    .maybeSingle<DbPayment>();

  if (error) {
    throw new Error(error.message);
  }

  if (!payment) {
    throw new Error("Payment was not found");
  }

  const next = applyPaymentEvent(
    {
      providerReference: payment.provider_reference,
      status: payment.status,
      amountMinor: payment.amount_minor,
      currency: payment.currency,
    },
    event ?? {
      type: "paid",
      providerReference: payment.provider_reference,
      amountMinor: payment.amount_minor,
      currency: payment.currency,
    },
  );

  const { error: paymentUpdateError } = await supabase
    .from("payments")
    .update({ status: next.status, updated_at: new Date().toISOString() })
    .eq("id", payment.id);

  if (paymentUpdateError) {
    throw new Error(paymentUpdateError.message);
  }

  if (next.status !== "paid") {
    return { status: next.status, claimToken: null };
  }

  const productKey = payment.product_key ?? "paid_report";
  if (productKey === "matching_unlock") {
    if (!payment.user_id) {
      throw new Error("Matching unlock payment is missing a user");
    }

    await grantMatchingEntitlement(supabase, payment.user_id, payment.id);
    return { status: "paid" as const, claimToken: null, matchingUnlocked: true as const };
  }

  if (!payment.quiz_session_id) {
    throw new Error("Paid report payment is missing a quiz session");
  }

  await updateQuizSessionStatus(supabase, payment.quiz_session_id, "paid");

  const existing = await getExistingClaimToken(supabase, payment.quiz_session_id, payment.raw_payload);
  if (existing) {
    return { status: "paid" as const, claimToken: existing };
  }

  await updateQuizSessionStatus(supabase, payment.quiz_session_id, "report_generating");

  try {
    const result = await generatePaidReport(createSupabaseReportRepository(supabase), {
      quizSessionId: payment.quiz_session_id,
      generateText: createOpenAIReportGenerator(),
    });

    await storePaymentClaimToken(supabase, payment, result.claimToken);
    await updateQuizSessionStatus(supabase, payment.quiz_session_id, "report_ready");

    return { status: "paid" as const, claimToken: result.claimToken };
  } catch {
    await updateQuizSessionStatus(supabase, payment.quiz_session_id, "report_failed");
    return { status: "paid" as const, claimToken: null, reportStatus: "failed" as const };
  }
}

export function createOpenAIReportGenerator() {
  if (!isUsableOpenAIKey(process.env.OPENAI_API_KEY)) {
    return async () => createFallbackReportOutput();
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  return async (input: { prompt: string; model: string; modelSettings: Record<string, unknown> }) => {
    const completion = await client.chat.completions.create({
      model: input.model,
      messages: [{ role: "user", content: input.prompt }],
      response_format: { type: "json_object" },
      temperature: typeof input.modelSettings.temperature === "number" ? input.modelSettings.temperature : 0.4,
    });
    const content = completion.choices[0]?.message?.content;

    if (!content) {
      throw new Error("OpenAI returned an empty report");
    }

    return JSON.parse(content);
  };
}

function isUsableOpenAIKey(apiKey: string | undefined) {
  return typeof apiKey === "string" && /^sk-(proj-)?/.test(apiKey);
}

function createSupabaseReportRepository(supabase: SupabaseClient): ReportGenerationRepository {
  return {
    async getReportInput(quizSessionId) {
      const prompt = await getPublishedPrompt(supabase);
      const archetype = await getPublishedArchetype(supabase);
      const answers = await getReportAnswers(supabase, quizSessionId);

      return {
        quizSessionId,
        promptVersionId: prompt.id,
        archetypeVersionId: archetype?.id ?? null,
        template: prompt.template,
        model: prompt.model,
        modelSettings: prompt.model_settings ?? {},
        displayName: "guest",
        archetypeName: archetype?.name ?? "Relationship pattern",
        answers,
      };
    },
    async createGeneratingReport(input) {
      const { data, error } = await supabase
        .from("reports")
        .upsert(
          {
            quiz_session_id: input.quizSessionId,
            prompt_version_id: input.promptVersionId,
            archetype_version_id: input.archetypeVersionId,
            status: "generating",
            report_number: createReportNumber(input.quizSessionId),
            input_snapshot: input.inputSnapshot,
            output: {},
            updated_at: new Date().toISOString(),
          },
          { onConflict: "quiz_session_id" },
        )
        .select("id, report_number")
        .single<{ id: string; report_number: string }>();

      if (error) {
        throw new Error(error.message);
      }

      return { reportId: data.id, reportNumber: data.report_number };
    },
    async completeReport(reportId, output) {
      const { error } = await supabase
        .from("reports")
        .update({ status: "completed", output, updated_at: new Date().toISOString() })
        .eq("id", reportId);

      if (error) {
        throw new Error(error.message);
      }
    },
    async failReport(reportId, message) {
      const { error } = await supabase
        .from("reports")
        .update({ status: "failed", error_message: message, updated_at: new Date().toISOString() })
        .eq("id", reportId);

      if (error) {
        throw new Error(error.message);
      }
    },
    async createClaimToken(input) {
      const { error } = await supabase.from("registration_claim_tokens").insert({
        quiz_session_id: input.quizSessionId,
        report_id: input.reportId,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt.toISOString(),
      });

      if (error) {
        throw new Error(error.message);
      }

      return input.rawToken;
    },
  };
}

async function getExistingClaimToken(
  supabase: SupabaseClient,
  quizSessionId: string,
  rawPayload: Record<string, unknown> | null,
) {
  const { data, error } = await supabase
    .from("reports")
    .select("id, status")
    .eq("quiz_session_id", quizSessionId)
    .eq("status", "completed")
    .maybeSingle<{ id: string; status: string }>();

  if (error) {
    throw new Error(error.message);
  }

  return data ? readStoredClaimToken(rawPayload) : null;
}

async function updateQuizSessionStatus(supabase: SupabaseClient, quizSessionId: string, status: string) {
  const { error } = await supabase
    .from("quiz_sessions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", quizSessionId);

  if (error) {
    throw new Error(error.message);
  }
}

async function grantMatchingEntitlement(supabase: SupabaseClient, userId: string, paymentId: string) {
  const { error } = await supabase.from("matching_entitlements").upsert(
    {
      user_id: userId,
      source_payment_id: paymentId,
      granted_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function storePaymentClaimToken(supabase: SupabaseClient, payment: DbPayment, claimToken: string) {
  const { error } = await supabase
    .from("payments")
    .update({
      raw_payload: {
        ...normalizeRawPayload(payment.raw_payload),
        claimToken,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id);

  if (error) {
    throw new Error(error.message);
  }
}

function readStoredClaimToken(rawPayload: Record<string, unknown> | null | undefined) {
  const normalized = normalizeRawPayload(rawPayload);
  const claimToken = normalized.claimToken ?? normalized.claim_token;

  return typeof claimToken === "string" && claimToken.trim() !== "" ? claimToken : null;
}

function normalizeRawPayload(rawPayload: Record<string, unknown> | null | undefined) {
  return rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload) ? rawPayload : {};
}

async function getPublishedPrompt(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("prompt_versions")
    .select("id, template, model, model_settings")
    .eq("slug", "paid-report-v1")
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .single<{ id: string; template: string; model: string; model_settings: Record<string, unknown> }>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function getPublishedArchetype(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("archetype_versions")
    .select("id, name")
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; name: string }>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function getReportAnswers(supabase: SupabaseClient, quizSessionId: string) {
  const { data: answers, error } = await supabase
    .from("quiz_answers")
    .select("question_id, question_option_id")
    .eq("quiz_session_id", quizSessionId)
    .returns<{ question_id: string; question_option_id: string }[]>();

  if (error) {
    throw new Error(error.message);
  }

  const questionIds = (answers ?? []).map((answer) => answer.question_id);
  const optionIds = (answers ?? []).map((answer) => answer.question_option_id);
  const [{ data: questions, error: questionsError }, { data: options, error: optionsError }] = await Promise.all([
    supabase.from("questions").select("id, prompt").in("id", questionIds).returns<{ id: string; prompt: string }[]>(),
    supabase
      .from("question_options")
      .select("id, label")
      .in("id", optionIds)
      .returns<{ id: string; label: string }[]>(),
  ]);

  if (questionsError) {
    throw new Error(questionsError.message);
  }
  if (optionsError) {
    throw new Error(optionsError.message);
  }

  const questionsById = new Map((questions ?? []).map((question) => [question.id, question.prompt]));
  const optionsById = new Map((options ?? []).map((option) => [option.id, option.label]));

  return (answers ?? []).map((answer) => ({
    question: questionsById.get(answer.question_id) ?? answer.question_id,
    answer: optionsById.get(answer.question_option_id) ?? answer.question_option_id,
  }));
}
