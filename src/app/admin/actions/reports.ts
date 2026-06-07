"use server";

import OpenAI from "openai";
import { buildAuditLog } from "@/domain/admin/audit";
import { createClaimToken } from "@/domain/claims/claim-token";
import { createFallbackReportOutput } from "@/domain/reports/fallback-output";
import { assembleReportPrompt } from "@/domain/reports/prompt";
import { canRetryReport, selectRetryPromptVersion, type ReportRetryMode } from "@/domain/reports/retry";
import { validateReportOutput } from "@/domain/reports/report-output";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { requireAdminActionActor } from "./guard";

type RetryReportRow = {
  id: string;
  quiz_session_id: string;
  status: "pending" | "generating" | "completed" | "failed";
  prompt_version_id: string;
  archetype_version_id: string | null;
  input_snapshot: {
    answers?: { question: string; answer: string }[];
  } | null;
};

type PromptRow = {
  id: string;
  template: string;
  model: string;
  model_settings: Record<string, unknown> | null;
};

export async function retryReportAction(formData: FormData) {
  const actor = await requireAdminActionActor();
  const reportId = String(formData.get("reportId") ?? "");
  const mode = normalizeRetryMode(formData.get("mode"));

  if (!reportId) {
    throw new Error("חסר מזהה דוח.");
  }

  const supabase = createServiceRoleClient();
  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("id, quiz_session_id, status, prompt_version_id, archetype_version_id, input_snapshot")
    .eq("id", reportId)
    .maybeSingle<RetryReportRow>();

  if (reportError) {
    throw new Error(reportError.message);
  }
  if (!report) {
    throw new Error("הדוח לא נמצא.");
  }
  if (!canRetryReport({ status: report.status })) {
    throw new Error("אפשר לנסות שוב רק דוחות שנכשלו.");
  }

  const originalPrompt = await getPromptVersion(report.prompt_version_id);
  const latestPrompt = mode === "latest" ? await getLatestPaidReportPrompt() : originalPrompt;
  const promptVersionId = selectRetryPromptVersion({
    mode,
    originalPromptVersionId: originalPrompt.id,
    latestPromptVersionId: latestPrompt.id,
  });
  const prompt = promptVersionId === latestPrompt.id ? latestPrompt : originalPrompt;
  const archetypeName = await getArchetypeName(report.archetype_version_id);
  const answers = report.input_snapshot?.answers ?? [];
  const assembledPrompt = assembleReportPrompt({
    template: prompt.template,
    displayName: "guest",
    archetypeName,
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

  if (generatingError) {
    throw new Error(generatingError.message);
  }

  const { error: auditError } = await supabase.from("admin_audit_logs").insert(
    buildAuditLog({
      actorUserId: actor.userId,
      action: "report.retry",
      targetTable: "reports",
      targetId: report.id,
      metadata: { mode, promptVersionId: prompt.id },
    }),
  );

  if (auditError) {
    throw new Error(auditError.message);
  }

  try {
    const output = validateReportOutput(
      await createOpenAIReportGenerator()({
        prompt: assembledPrompt,
        model: prompt.model,
        modelSettings: prompt.model_settings ?? {},
      }),
    );

    const { error: completeError } = await supabase
      .from("reports")
      .update({ status: "completed", output, updated_at: new Date().toISOString() })
      .eq("id", report.id);

    if (completeError) {
      throw new Error(completeError.message);
    }

    await ensureClaimToken(report.quiz_session_id, report.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "הפקת הדוח נכשלה.";
    const { error: failError } = await supabase
      .from("reports")
      .update({ status: "failed", error_message: message, updated_at: new Date().toISOString() })
      .eq("id", report.id);

    if (failError) {
      throw new Error(failError.message);
    }

    throw error;
  } finally {
    revalidatePath("/admin/reports");
  }
}

function normalizeRetryMode(value: FormDataEntryValue | null): ReportRetryMode {
  return value === "latest" ? "latest" : "original";
}

async function getPromptVersion(id: string): Promise<PromptRow> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("prompt_versions")
    .select("id, template, model, model_settings")
    .eq("id", id)
    .maybeSingle<PromptRow>();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("גרסת הפרומפט לא נמצאה.");
  }

  return data;
}

async function getLatestPaidReportPrompt(): Promise<PromptRow> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("prompt_versions")
    .select("id, template, model, model_settings")
    .eq("slug", "paid-report-v1")
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<PromptRow>();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("לא נמצאה גרסת פרומפט מפורסמת לדוח בתשלום.");
  }

  return data;
}

async function getArchetypeName(id: string | null) {
  if (!id) {
    return "דפוס זוגיות";
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("archetype_versions")
    .select("name")
    .eq("id", id)
    .maybeSingle<{ name: string }>();

  if (error) {
    throw new Error(error.message);
  }

  return data?.name ?? "דפוס זוגיות";
}

async function ensureClaimToken(quizSessionId: string, reportId: string) {
  const supabase = createServiceRoleClient();
  const { data: existing, error } = await supabase
    .from("registration_claim_tokens")
    .select("id")
    .eq("report_id", reportId)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error(error.message);
  }
  if (existing) {
    return;
  }

  const token = await createClaimToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error: insertError } = await supabase.from("registration_claim_tokens").insert({
    quiz_session_id: quizSessionId,
    report_id: reportId,
    token_hash: token.tokenHash,
    expires_at: expiresAt,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }
}

function createOpenAIReportGenerator() {
  if (!process.env.OPENAI_API_KEY) {
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
      throw new Error("OpenAI החזיר דוח ריק.");
    }

    return JSON.parse(content);
  };
}
