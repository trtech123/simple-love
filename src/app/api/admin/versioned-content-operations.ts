import { apiError, apiSuccess } from "@/app/api/envelope";
import { validateArchetypeVersion } from "@/domain/admin/archetype-admin";
import { validatePromptVersion } from "@/domain/admin/prompt-admin";
import {
  buildQuestionnaireReplacementPayload,
  validateQuestionnaireDraft,
} from "@/domain/admin/questionnaire-admin";
import {
  buildDraftCreateAuditLog,
  buildDraftSaveAuditLog,
  buildDraftVersionInsert,
  buildVersionArchiveAuditLog,
  buildVersionPublishAuditLog,
  getSiblingPublishPlan,
  validateArchiveTarget,
  validateDraftSaveTarget,
  type VersionStatus,
} from "@/domain/admin/version-operations";
import { createServiceRoleClient } from "@/lib/supabase/admin";

type VersionRow = {
  id: string;
  version?: number;
  status: VersionStatus;
  published_at?: string | null;
  created_at?: string;
  [key: string]: unknown;
};

type VersionConfig = {
  table: string;
  groupColumn: string;
  listSelect: string;
  detailSelect: string;
  draftSelect: string;
  schemaMessage: string;
  validate: (body: unknown) => Record<string, unknown>;
};

const promptConfig: VersionConfig = {
  table: "prompt_versions",
  groupColumn: "slug",
  listSelect: "id, slug, version, status, model, published_at, created_at",
  detailSelect: "id, slug, version, status, template, model, model_settings, published_at, created_at",
  draftSelect: "id, slug, version, status, template, model, model_settings, published_at, created_at",
  schemaMessage: "ניהול הפרומפטים אינו זמין כרגע.",
  validate(body) {
    const record = readRecord(body);
    const prompt = validatePromptVersion({
      template: record.template,
      model: record.model,
      modelSettings: readRecord(record.modelSettings),
    });
    return { template: prompt.template, model: prompt.model, model_settings: prompt.modelSettings };
  },
};

const archetypeConfig: VersionConfig = {
  table: "archetype_versions",
  groupColumn: "archetype_id",
  listSelect:
    "id, archetype_id, version, status, name, short_description, full_description, matching_meaning, scoring_rules, published_at, created_at, archetypes(stable_key)",
  detailSelect:
    "id, archetype_id, version, status, name, short_description, full_description, matching_meaning, scoring_rules, published_at, created_at, archetypes(stable_key)",
  draftSelect:
    "id, archetype_id, version, status, name, short_description, full_description, matching_meaning, scoring_rules, published_at, created_at",
  schemaMessage: "ניהול הארכיטיפים אינו זמין כרגע.",
  validate(body) {
    const record = readRecord(body);
    const archetype = validateArchetypeVersion({
      name: record.name,
      shortDescription: record.shortDescription,
      fullDescription: record.fullDescription,
      matchingMeaning: record.matchingMeaning,
      scoringRules: readRecord(record.scoringRules),
    });
    return {
      name: archetype.name,
      short_description: archetype.shortDescription,
      full_description: archetype.fullDescription,
      matching_meaning: archetype.matchingMeaning,
      scoring_rules: archetype.scoringRules,
    };
  },
};

const questionnaireVersionConfig: VersionConfig = {
  ...promptConfig,
  table: "questionnaire_versions",
  groupColumn: "questionnaire_id",
  schemaMessage: "ניהול השאלונים אינו זמין כרגע.",
};

export const listPromptVersions = () => listVersions(promptConfig);
export const getPromptVersion = (versionId: string) => getVersion(promptConfig, versionId);
export const createPromptDraft = (actorUserId: string, body: unknown) => createDraft(actorUserId, promptConfig, body);
export const updatePromptDraft = (actorUserId: string, versionId: string, body: unknown) =>
  updateDraft(actorUserId, promptConfig, versionId, body);
export const publishPromptVersion = (actorUserId: string, versionId: string) =>
  publishVersion(actorUserId, promptConfig, versionId);
export const archivePromptVersion = (actorUserId: string, versionId: string) =>
  archiveVersion(actorUserId, promptConfig, versionId);

export const listArchetypeVersions = () => listVersions(archetypeConfig);
export const getArchetypeVersion = (versionId: string) => getVersion(archetypeConfig, versionId);
export const createArchetypeDraft = (actorUserId: string, body: unknown) =>
  createDraft(actorUserId, archetypeConfig, body);
export const updateArchetypeDraft = (actorUserId: string, versionId: string, body: unknown) =>
  updateDraft(actorUserId, archetypeConfig, versionId, body);
export const publishArchetypeVersion = (actorUserId: string, versionId: string) =>
  publishVersion(actorUserId, archetypeConfig, versionId);
export const archiveArchetypeVersion = (actorUserId: string, versionId: string) =>
  archiveVersion(actorUserId, archetypeConfig, versionId);

export async function listQuestionnaireVersions() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("questionnaire_versions")
    .select("id, questionnaire_id, version, status, published_at, created_at, questionnaires(title, slug, purpose)")
    .order("created_at", { ascending: false })
    .returns<VersionRow[]>();

  return error ? schemaUnavailable("ניהול השאלונים אינו זמין כרגע.") : apiSuccess({ versions: data ?? [] });
}

export async function getQuestionnaireVersion(versionId: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("questionnaire_versions")
    .select(
      "id, questionnaire_id, version, status, published_at, created_at, questionnaires(title, slug, purpose), questionnaire_blocks(title, position, questions(stable_key, prompt, question_type, position, usage_flags, question_options(label, value, position)))",
    )
    .eq("id", versionId)
    .maybeSingle<VersionRow>();

  if (error) return schemaUnavailable("ניהול השאלונים אינו זמין כרגע.");
  return data ? apiSuccess({ version: data }) : notFound();
}

export async function createQuestionnaireDraft(actorUserId: string, body: unknown) {
  const sourceVersionId = readText(body, "sourceVersionId");
  if (!sourceVersionId) return validationFailed("חסרה גרסת מקור לטיוטה.");

  const supabase = createServiceRoleClient();
  const { data: source, error: sourceError } = await supabase
    .from("questionnaire_versions")
    .select("id, questionnaire_id, version, status, created_at, published_at")
    .eq("id", sourceVersionId)
    .maybeSingle<VersionRow>();
  if (sourceError) return schemaUnavailable("אי אפשר ליצור טיוטה כרגע.");
  if (!source) return notFound();

  const { data: maxRows, error: maxError } = await supabase
    .from("questionnaire_versions")
    .select("version")
    .eq("questionnaire_id", source.questionnaire_id)
    .order("version", { ascending: false })
    .limit(1)
    .returns<{ version: number }[]>();
  if (maxError) return schemaUnavailable("אי אפשר ליצור טיוטה כרגע.");

  const { data: draft, error: insertError } = await supabase
    .from("questionnaire_versions")
    .insert(buildDraftVersionInsert({ source, maxVersion: maxRows?.[0]?.version ?? 0, omit: ["id", "created_at"] }))
    .select("id")
    .single<{ id: string }>();
  if (insertError || !draft) return schemaUnavailable("אי אפשר ליצור טיוטה כרגע.");

  const copyError = await copyQuestionnaireChildren(sourceVersionId, draft.id);
  if (copyError) return schemaUnavailable("הטיוטה נוצרה אבל העתקת השאלות נכשלה.");

  const audit = await insertAudit(
    buildDraftCreateAuditLog({
      actorUserId,
      targetTable: "questionnaire_versions",
      sourceVersionId,
      draftVersionId: draft.id,
    }),
  );
  return audit ?? apiSuccess({ versionId: draft.id }, { status: 201 });
}

export async function updateQuestionnaireDraft(actorUserId: string, versionId: string, body: unknown) {
  const target = await loadVersion("questionnaire_versions", versionId, "id, status");
  if (target instanceof Response) return target;
  if (!target) return notFound();

  try {
    validateDraftSaveTarget(target);
  } catch {
    return apiError({ status: 409, code: "version_not_editable", message: "אפשר לערוך רק טיוטות." });
  }

  let payload;
  try {
    payload = buildQuestionnaireReplacementPayload(validateQuestionnaireDraft(body));
  } catch (error) {
    return apiError({
      status: 400,
      code: "validation_failed",
      message: "מבנה השאלון אינו תקין.",
      details: { reason: error instanceof Error ? error.message : "מבנה השאלון אינו תקין." },
    });
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.rpc("replace_draft_questionnaire_version", {
    p_version_id: versionId,
    p_payload: payload,
  });
  if (error) return schemaUnavailable("אי אפשר לשמור את הטיוטה כרגע.");

  const audit = await insertAudit(
    buildDraftSaveAuditLog({ actorUserId, targetTable: "questionnaire_versions", draftVersionId: versionId }),
  );
  return audit ?? apiSuccess({ versionId });
}

export const publishQuestionnaireVersion = (actorUserId: string, versionId: string) =>
  publishVersion(actorUserId, questionnaireVersionConfig, versionId);
export const archiveQuestionnaireVersion = (actorUserId: string, versionId: string) =>
  archiveVersion(actorUserId, questionnaireVersionConfig, versionId);

async function listVersions(config: VersionConfig) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from(config.table)
    .select(config.listSelect)
    .order("created_at", { ascending: false })
    .returns<VersionRow[]>();

  return error ? schemaUnavailable(config.schemaMessage) : apiSuccess({ versions: data ?? [] });
}

async function getVersion(config: VersionConfig, versionId: string) {
  const target = await loadVersion(config.table, versionId, config.detailSelect);
  if (target instanceof Response) return target;
  return target ? apiSuccess({ version: target }) : notFound();
}

async function createDraft(actorUserId: string, config: VersionConfig, body: unknown) {
  const sourceVersionId = readText(body, "sourceVersionId");
  if (!sourceVersionId) return validationFailed("חסרה גרסת מקור לטיוטה.");

  const source = await loadVersion(config.table, sourceVersionId, config.draftSelect);
  if (source instanceof Response) return source;
  if (!source) return notFound();

  const groupValue = source[config.groupColumn];
  if (typeof groupValue !== "string") return notFound();

  const supabase = createServiceRoleClient();
  const { data: maxRows, error: maxError } = await supabase
    .from(config.table)
    .select("version")
    .eq(config.groupColumn, groupValue)
    .order("version", { ascending: false })
    .limit(1)
    .returns<{ version: number }[]>();
  if (maxError) return schemaUnavailable("אי אפשר ליצור טיוטה כרגע.");

  const { data: draft, error: insertError } = await supabase
    .from(config.table)
    .insert(buildDraftVersionInsert({ source, maxVersion: maxRows?.[0]?.version ?? 0, omit: ["id", "created_at"] }))
    .select("id")
    .single<{ id: string }>();
  if (insertError || !draft) return schemaUnavailable("אי אפשר ליצור טיוטה כרגע.");

  const audit = await insertAudit(
    buildDraftCreateAuditLog({ actorUserId, targetTable: config.table, sourceVersionId, draftVersionId: draft.id }),
  );
  return audit ?? apiSuccess({ versionId: draft.id }, { status: 201 });
}

async function updateDraft(actorUserId: string, config: VersionConfig, versionId: string, body: unknown) {
  const target = await loadVersion(config.table, versionId, "id, status");
  if (target instanceof Response) return target;
  if (!target) return notFound();

  try {
    validateDraftSaveTarget(target);
  } catch {
    return apiError({ status: 409, code: "version_not_editable", message: "אפשר לערוך רק טיוטות." });
  }

  let payload;
  try {
    payload = config.validate(body);
  } catch (error) {
    return apiError({
      status: 400,
      code: "validation_failed",
      message: "הנתונים אינם תקינים.",
      details: { reason: error instanceof Error ? error.message : "הנתונים אינם תקינים." },
    });
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from(config.table).update(payload).eq("id", versionId);
  if (error) return schemaUnavailable("אי אפשר לשמור את הטיוטה כרגע.");

  const audit = await insertAudit(
    buildDraftSaveAuditLog({ actorUserId, targetTable: config.table, draftVersionId: versionId }),
  );
  return audit ?? apiSuccess({ versionId });
}

async function publishVersion(actorUserId: string, config: VersionConfig, versionId: string) {
  const target = await loadVersion(config.table, versionId, `id, status, ${config.groupColumn}`);
  if (target instanceof Response) return target;
  if (!target) return notFound();

  const groupValue = target[config.groupColumn];
  if (typeof groupValue !== "string") return notFound();

  const supabase = createServiceRoleClient();
  const { data: siblings, error } = await supabase
    .from(config.table)
    .select("id, status")
    .eq(config.groupColumn, groupValue)
    .returns<VersionRow[]>();
  if (error) return schemaUnavailable("אי אפשר לפרסם את הגרסה כרגע.");

  let plan;
  try {
    plan = getSiblingPublishPlan({ target, siblings: siblings ?? [] });
  } catch {
    return apiError({ status: 409, code: "version_not_editable", message: "אפשר לפרסם רק טיוטה." });
  }

  if (plan.archiveVersionIds.length) {
    const { error: archiveError } = await supabase
      .from(config.table)
      .update({ status: "archived" })
      .in("id", plan.archiveVersionIds);
    if (archiveError) return schemaUnavailable("אי אפשר לפרסם את הגרסה כרגע.");
  }

  const { error: publishError } = await supabase
    .from(config.table)
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", plan.publishVersionId);
  if (publishError) return schemaUnavailable("אי אפשר לפרסם את הגרסה כרגע.");

  const audit = await insertAudit(
    buildVersionPublishAuditLog({
      actorUserId,
      targetTable: config.table,
      targetId: plan.publishVersionId,
      archivedSiblingIds: plan.archiveVersionIds,
    }),
  );
  return audit ?? apiSuccess({ versionId: plan.publishVersionId });
}

async function archiveVersion(actorUserId: string, config: VersionConfig, versionId: string) {
  const target = await loadVersion(config.table, versionId, "id, status");
  if (target instanceof Response) return target;
  if (!target) return notFound();

  try {
    validateArchiveTarget(target);
  } catch {
    return apiError({ status: 409, code: "version_not_editable", message: "הגרסה כבר בארכיון." });
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from(config.table).update({ status: "archived" }).eq("id", versionId);
  if (error) return schemaUnavailable("אי אפשר להעביר את הגרסה לארכיון כרגע.");

  const audit = await insertAudit(
    buildVersionArchiveAuditLog({ actorUserId, targetTable: config.table, targetId: versionId }),
  );
  return audit ?? apiSuccess({ versionId });
}

async function loadVersion(table: string, versionId: string, select: string): Promise<VersionRow | Response | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.from(table).select(select).eq("id", versionId).maybeSingle<VersionRow>();
  return error ? schemaUnavailable("ניהול התוכן אינו זמין כרגע.") : data;
}

async function copyQuestionnaireChildren(sourceVersionId: string, draftVersionId: string) {
  const supabase = createServiceRoleClient();
  const { data: blocks, error } = await supabase
    .from("questionnaire_blocks")
    .select(
      "title, position, questions(stable_key, prompt, question_type, position, usage_flags, trait_mapping, question_options(label, value, position, score))",
    )
    .eq("questionnaire_version_id", sourceVersionId)
    .order("position", { ascending: true })
    .returns<
      {
        title: string;
        position: number;
        questions?: {
          stable_key: string;
          prompt: string;
          question_type: string;
          position: number;
          usage_flags?: Record<string, unknown>;
          trait_mapping?: Record<string, unknown>;
          question_options?: { label: string; value: string; position: number; score?: Record<string, unknown> }[];
        }[];
      }[]
    >();
  if (error) return error;

  for (const block of blocks ?? []) {
    const { data: createdBlock, error: blockError } = await supabase
      .from("questionnaire_blocks")
      .insert({ questionnaire_version_id: draftVersionId, title: block.title, position: block.position })
      .select("id")
      .single<{ id: string }>();
    if (blockError || !createdBlock) return blockError ?? { message: "שמירת הבלוק נכשלה." };

    for (const question of block.questions ?? []) {
      const { data: createdQuestion, error: questionError } = await supabase
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
      if (questionError || !createdQuestion) return questionError ?? { message: "שמירת השאלה נכשלה." };

      const options = (question.question_options ?? []).map((option) => ({
        question_id: createdQuestion.id,
        label: option.label,
        value: option.value,
        position: option.position,
        score: option.score ?? {},
      }));
      if (options.length) {
        const { error: optionError } = await supabase.from("question_options").insert(options);
        if (optionError) return optionError;
      }
    }
  }

  return null;
}

async function insertAudit(row: Record<string, unknown>) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("admin_audit_logs").insert(row);
  return error ? schemaUnavailable("הפעולה הצליחה אבל רישום הביקורת נכשל.") : null;
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readText(value: unknown, key: string) {
  const record = readRecord(value);
  return typeof record[key] === "string" ? record[key].trim() : "";
}

function validationFailed(message: string) {
  return apiError({ status: 400, code: "validation_failed", message });
}

function notFound() {
  return apiError({ status: 404, code: "not_found", message: "הגרסה לא נמצאה." });
}

function schemaUnavailable(message: string) {
  return apiError({ status: 503, code: "schema_unavailable", message });
}
