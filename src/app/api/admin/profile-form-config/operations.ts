import { apiError, apiSuccess } from "@/app/api/envelope";
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
import { parseProfileFormConfig } from "@/domain/matching/profile-form-config";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const PROFILE_FORM_CONFIG_TABLE = "profile_form_config_versions";

type VersionRow = {
  id: string;
  profile_form_config_id: string;
  version: number;
  status: VersionStatus;
  config: unknown;
  published_at: string | null;
  created_at?: string;
};

export async function listProfileFormConfigVersions() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from(PROFILE_FORM_CONFIG_TABLE)
    .select("id, profile_form_config_id, version, status, published_at, created_at")
    .order("created_at", { ascending: false })
    .returns<VersionRow[]>();

  if (error) {
    return apiError({ status: 503, code: "schema_unavailable", message: "ניהול טופס הפרופיל אינו זמין כרגע." });
  }

  return apiSuccess({ versions: data ?? [] });
}

export async function getProfileFormConfigVersion(versionId: string) {
  const target = await loadVersion(versionId, "id, profile_form_config_id, version, status, config, published_at, created_at");
  if (!target) {
    return apiError({ status: 404, code: "not_found", message: "הגרסה לא נמצאה." });
  }

  return apiSuccess({ version: target });
}

export async function createProfileFormConfigDraft(actorUserId: string, body: unknown) {
  const sourceVersionId = readBodyText(body, "sourceVersionId");
  if (!sourceVersionId) {
    return apiError({ status: 400, code: "validation_failed", message: "חסרה גרסת מקור לטיוטה." });
  }

  const source = await loadVersion(sourceVersionId, "id, profile_form_config_id, version, status, config, published_at, created_at");
  if (!source) {
    return apiError({ status: 404, code: "not_found", message: "הגרסה לא נמצאה." });
  }

  const supabase = createServiceRoleClient();
  const { data: maxRows, error: maxError } = await supabase
    .from(PROFILE_FORM_CONFIG_TABLE)
    .select("version")
    .eq("profile_form_config_id", source.profile_form_config_id)
    .order("version", { ascending: false })
    .limit(1)
    .returns<{ version: number }[]>();

  if (maxError) {
    return apiError({ status: 503, code: "schema_unavailable", message: "אי אפשר ליצור טיוטה כרגע." });
  }

  const { data: draft, error: insertError } = await supabase
    .from(PROFILE_FORM_CONFIG_TABLE)
    .insert(
      buildDraftVersionInsert({
        source,
        maxVersion: maxRows?.[0]?.version ?? 0,
        omit: ["id", "created_at"],
      }),
    )
    .select("id")
    .single<{ id: string }>();

  if (insertError || !draft) {
    return apiError({ status: 503, code: "schema_unavailable", message: "אי אפשר ליצור טיוטה כרגע." });
  }

  const { error: auditError } = await supabase.from("admin_audit_logs").insert(
    buildDraftCreateAuditLog({
      actorUserId,
      targetTable: PROFILE_FORM_CONFIG_TABLE,
      sourceVersionId,
      draftVersionId: draft.id,
    }),
  );

  if (auditError) {
    return apiError({ status: 503, code: "schema_unavailable", message: "הטיוטה נוצרה אבל רישום הביקורת נכשל." });
  }

  return apiSuccess({ versionId: draft.id }, { status: 201 });
}

export async function updateProfileFormConfigDraft(actorUserId: string, versionId: string, body: unknown) {
  const target = await loadVersion(versionId, "id, status");
  if (!target) {
    return apiError({ status: 404, code: "not_found", message: "הגרסה לא נמצאה." });
  }

  try {
    validateDraftSaveTarget(target);
  } catch {
    return apiError({ status: 409, code: "version_not_editable", message: "אפשר לערוך רק טיוטות." });
  }

  let config;
  try {
    config = parseProfileFormConfig(readBodyRecord(body).config);
  } catch (error) {
    return apiError({
      status: 400,
      code: "validation_failed",
      message: "הגדרת הטופס אינה תקינה.",
      details: { reason: error instanceof Error ? error.message : "הגדרת הטופס אינה תקינה." },
    });
  }

  const supabase = createServiceRoleClient();
  const { error: updateError } = await supabase.from(PROFILE_FORM_CONFIG_TABLE).update({ config }).eq("id", versionId);
  if (updateError) {
    return apiError({ status: 503, code: "schema_unavailable", message: "אי אפשר לשמור את הטיוטה כרגע." });
  }

  const { error: auditError } = await supabase.from("admin_audit_logs").insert(
    buildDraftSaveAuditLog({
      actorUserId,
      targetTable: PROFILE_FORM_CONFIG_TABLE,
      draftVersionId: versionId,
    }),
  );

  if (auditError) {
    return apiError({ status: 503, code: "schema_unavailable", message: "הטיוטה נשמרה אבל רישום הביקורת נכשל." });
  }

  return apiSuccess({ versionId });
}

export async function publishProfileFormConfigVersion(actorUserId: string, versionId: string) {
  const target = await loadVersion(versionId, "id, profile_form_config_id, status");
  if (!target) {
    return apiError({ status: 404, code: "not_found", message: "הגרסה לא נמצאה." });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from(PROFILE_FORM_CONFIG_TABLE)
    .select("id, status")
    .eq("profile_form_config_id", target.profile_form_config_id)
    .returns<VersionRow[]>();

  if (error) {
    return apiError({ status: 503, code: "schema_unavailable", message: "אי אפשר לפרסם את הגרסה כרגע." });
  }
  const siblings = data ?? [];

  let plan;
  try {
    plan = getSiblingPublishPlan({ target, siblings });
  } catch {
    return apiError({ status: 409, code: "version_not_editable", message: "אפשר לפרסם רק טיוטה." });
  }

  if (plan.archiveVersionIds.length > 0) {
    const { error: archiveSiblingsError } = await supabase
      .from(PROFILE_FORM_CONFIG_TABLE)
      .update({ status: "archived" })
      .in("id", plan.archiveVersionIds);
    if (archiveSiblingsError) {
      return apiError({ status: 503, code: "schema_unavailable", message: "אי אפשר לפרסם את הגרסה כרגע." });
    }
  }

  const { error: publishError } = await supabase
    .from(PROFILE_FORM_CONFIG_TABLE)
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", plan.publishVersionId);

  if (publishError) {
    return apiError({ status: 503, code: "schema_unavailable", message: "אי אפשר לפרסם את הגרסה כרגע." });
  }

  const { error: auditError } = await supabase.from("admin_audit_logs").insert(
    buildVersionPublishAuditLog({
      actorUserId,
      targetTable: PROFILE_FORM_CONFIG_TABLE,
      targetId: plan.publishVersionId,
      archivedSiblingIds: plan.archiveVersionIds,
    }),
  );

  if (auditError) {
    return apiError({ status: 503, code: "schema_unavailable", message: "הגרסה פורסמה אבל רישום הביקורת נכשל." });
  }

  return apiSuccess({ versionId: plan.publishVersionId });
}

export async function archiveProfileFormConfigVersion(actorUserId: string, versionId: string) {
  const target = await loadVersion(versionId, "id, status");
  if (!target) {
    return apiError({ status: 404, code: "not_found", message: "הגרסה לא נמצאה." });
  }

  try {
    validateArchiveTarget(target);
  } catch {
    return apiError({ status: 409, code: "version_not_editable", message: "הגרסה כבר בארכיון." });
  }

  const supabase = createServiceRoleClient();
  const { error: archiveError } = await supabase.from(PROFILE_FORM_CONFIG_TABLE).update({ status: "archived" }).eq("id", versionId);
  if (archiveError) {
    return apiError({ status: 503, code: "schema_unavailable", message: "אי אפשר להעביר את הגרסה לארכיון כרגע." });
  }

  const { error: auditError } = await supabase.from("admin_audit_logs").insert(
    buildVersionArchiveAuditLog({
      actorUserId,
      targetTable: PROFILE_FORM_CONFIG_TABLE,
      targetId: versionId,
    }),
  );

  if (auditError) {
    return apiError({ status: 503, code: "schema_unavailable", message: "הגרסה הועברה לארכיון אבל רישום הביקורת נכשל." });
  }

  return apiSuccess({ versionId });
}

async function loadVersion(versionId: string, select: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from(PROFILE_FORM_CONFIG_TABLE)
    .select(select)
    .eq("id", versionId)
    .maybeSingle<VersionRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

function readBodyRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readBodyText(value: unknown, key: string) {
  const record = readBodyRecord(value);
  return typeof record[key] === "string" ? record[key].trim() : "";
}
