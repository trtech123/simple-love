import {
  buildQuestionnaireReplacementPayload,
  validateQuestionnaireDraft,
  type QuestionnaireDraft,
} from "@/domain/admin/questionnaire-admin";
import {
  buildDraftCreateAuditLog,
  buildDraftSaveAuditLog,
  buildDraftVersionInsert,
  validateDraftSaveTarget,
  type VersionStatus,
} from "@/domain/admin/version-operations";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { requireAdminActionActor } from "./guard";
import { archiveVersionAction, publishVersionAction } from "./version-actions";

export function buildQuestionnairePublishAction(versionId: string, actorUserId: string) {
  return { type: "questionnaire.publish" as const, versionId, actorUserId };
}

const questionnaireConfig = {
  table: "questionnaire_versions",
  groupColumn: "questionnaire_id",
  path: "/admin/questionnaires",
};

export async function publishQuestionnaireVersionAction(formData: FormData) {
  "use server";
  return publishVersionAction(formData, questionnaireConfig);
}

export async function archiveQuestionnaireVersionAction(formData: FormData) {
  "use server";
  return archiveVersionAction(formData, questionnaireConfig);
}

type QuestionnaireVersionRow = {
  id: string;
  questionnaire_id: string;
  version: number;
  status: VersionStatus;
  created_at?: string;
  published_at: string | null;
};

type SourceBlock = {
  title: string;
  position: number;
  questions?: {
    stable_key: string;
    prompt: string;
    question_type: "multiple_choice" | "scale" | "open_text";
    position: number;
    usage_flags: Record<string, boolean>;
    trait_mapping?: Record<string, unknown>;
    question_options?: {
      label: string;
      value: string;
      position: number;
      score?: Record<string, unknown>;
    }[];
  }[];
};

export async function createQuestionnaireDraftVersionAction(formData: FormData) {
  "use server";
  const actor = await requireAdminActionActor();
  const sourceVersionId = String(formData.get("versionId") ?? "");

  if (!sourceVersionId) {
    throw new Error("Version id is required");
  }

  const supabase = createServiceRoleClient();
  const { data: source, error: sourceError } = await supabase
    .from("questionnaire_versions")
    .select("id, questionnaire_id, version, status, created_at, published_at")
    .eq("id", sourceVersionId)
    .maybeSingle<QuestionnaireVersionRow>();

  if (sourceError) {
    throw new Error(sourceError.message);
  }
  if (!source) {
    throw new Error("Version was not found");
  }

  const { data: maxRows, error: maxError } = await supabase
    .from("questionnaire_versions")
    .select("version")
    .eq("questionnaire_id", source.questionnaire_id)
    .order("version", { ascending: false })
    .limit(1)
    .returns<{ version: number }[]>();

  if (maxError) {
    throw new Error(maxError.message);
  }

  const { data: draft, error: insertError } = await supabase
    .from("questionnaire_versions")
    .insert(
      buildDraftVersionInsert({
        source,
        maxVersion: maxRows?.[0]?.version ?? 0,
        omit: ["id", "created_at"],
      }),
    )
    .select("id")
    .single<{ id: string }>();

  if (insertError) {
    throw new Error(insertError.message);
  }

  await copyQuestionnaireChildren(sourceVersionId, draft.id);

  const { error: auditError } = await supabase.from("admin_audit_logs").insert(
    buildDraftCreateAuditLog({
      actorUserId: actor.userId,
      targetTable: "questionnaire_versions",
      sourceVersionId,
      draftVersionId: draft.id,
    }),
  );

  if (auditError) {
    throw new Error(auditError.message);
  }

  revalidatePath("/admin/questionnaires");
  revalidatePath(`/admin/questionnaires/${draft.id}`);
}

export async function saveQuestionnaireDraftVersionAction(formData: FormData) {
  "use server";
  const actor = await requireAdminActionActor();
  const versionId = String(formData.get("versionId") ?? "");

  if (!versionId) {
    throw new Error("Version id is required");
  }

  const supabase = createServiceRoleClient();
  const { data: target, error: targetError } = await supabase
    .from("questionnaire_versions")
    .select("id, status")
    .eq("id", versionId)
    .maybeSingle<{ id: string; status: VersionStatus }>();

  if (targetError) {
    throw new Error(targetError.message);
  }
  if (!target) {
    throw new Error("Version was not found");
  }

  validateDraftSaveTarget(target);

  const payload = buildQuestionnaireReplacementPayload(parseQuestionnairePayload(formData.get("payload")));
  const { error: rpcError } = await supabase.rpc("replace_draft_questionnaire_version", {
    p_version_id: versionId,
    p_payload: payload,
  });

  if (rpcError) {
    throw new Error(rpcError.message);
  }

  const { error: auditError } = await supabase.from("admin_audit_logs").insert(
    buildDraftSaveAuditLog({
      actorUserId: actor.userId,
      targetTable: "questionnaire_versions",
      draftVersionId: versionId,
    }),
  );

  if (auditError) {
    throw new Error(auditError.message);
  }

  revalidatePath("/admin/questionnaires");
  revalidatePath(`/admin/questionnaires/${versionId}`);
}

async function copyQuestionnaireChildren(sourceVersionId: string, draftVersionId: string) {
  const supabase = createServiceRoleClient();
  const { data: blocks, error: blocksError } = await supabase
    .from("questionnaire_blocks")
    .select(
      "title, position, questions(stable_key, prompt, question_type, position, usage_flags, trait_mapping, question_options(label, value, position, score))",
    )
    .eq("questionnaire_version_id", sourceVersionId)
    .order("position", { ascending: true })
    .returns<SourceBlock[]>();

  if (blocksError) {
    throw new Error(blocksError.message);
  }

  for (const block of blocks ?? []) {
    const { data: createdBlock, error: blockInsertError } = await supabase
      .from("questionnaire_blocks")
      .insert({
        questionnaire_version_id: draftVersionId,
        title: block.title,
        position: block.position,
      })
      .select("id")
      .single<{ id: string }>();

    if (blockInsertError) {
      throw new Error(blockInsertError.message);
    }

    for (const question of block.questions ?? []) {
      const { data: createdQuestion, error: questionInsertError } = await supabase
        .from("questions")
        .insert({
          questionnaire_block_id: createdBlock.id,
          stable_key: question.stable_key,
          prompt: question.prompt,
          question_type: question.question_type,
          position: question.position,
          usage_flags: question.usage_flags ?? {},
          trait_mapping: question.trait_mapping ?? {},
        })
        .select("id")
        .single<{ id: string }>();

      if (questionInsertError) {
        throw new Error(questionInsertError.message);
      }

      const options = (question.question_options ?? []).map((option) => ({
        question_id: createdQuestion.id,
        label: option.label,
        value: option.value,
        position: option.position,
        score: option.score ?? {},
      }));

      if (options.length > 0) {
        const { error: optionInsertError } = await supabase.from("question_options").insert(options);

        if (optionInsertError) {
          throw new Error(optionInsertError.message);
        }
      }
    }
  }
}

function parseQuestionnairePayload(value: FormDataEntryValue | null): QuestionnaireDraft {
  try {
    return validateQuestionnaireDraft(JSON.parse(String(value ?? "{}")));
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Questionnaire payload must be valid JSON");
  }
}
