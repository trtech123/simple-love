import { apiError, apiSuccess } from "@/app/api/envelope";
import { buildAuditLog } from "@/domain/admin/audit";
import { validateMatchSettings } from "@/domain/admin/match-settings-admin";
import {
  buildDraftVersionInsert,
  getSiblingPublishPlan,
  validateArchiveTarget,
  validateDraftSaveTarget,
  type VersionStatus,
} from "@/domain/admin/version-operations";
import { loadMatchProfiles, rerunMatchesForUser, rerunMatchesGlobally } from "@/domain/matching/rerun";
import { loadPublishedMatchSettings } from "@/domain/matching/settings-repository";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const MATCH_SETTINGS_TABLE = "match_settings_versions";

type MatchSettingsVersionRow = {
  id: string;
  match_settings_id: string;
  version: number;
  status: VersionStatus;
  weights: Record<string, number>;
  hard_filters: string[];
  deal_breaker_filters?: string[];
  published_at: string | null;
  created_at?: string;
};

export async function listMatchSettingsVersions() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from(MATCH_SETTINGS_TABLE)
    .select("id, match_settings_id, version, status, published_at, created_at, weights, hard_filters, deal_breaker_filters")
    .order("created_at", { ascending: false })
    .returns<MatchSettingsVersionRow[]>();

  if (error) {
    return apiError({ status: 503, code: "schema_unavailable", message: "ניהול הגדרות ההתאמה אינו זמין כרגע." });
  }

  return apiSuccess({ versions: data ?? [] });
}

export async function getMatchSettingsVersion(versionId: string) {
  const target = await loadVersion(versionId, "id, match_settings_id, version, status, weights, hard_filters, deal_breaker_filters, published_at, created_at");
  if (!target) {
    return apiError({ status: 404, code: "not_found", message: "הגרסה לא נמצאה." });
  }

  return apiSuccess({ version: target });
}

export async function createMatchSettingsDraft(actorUserId: string, body: unknown) {
  const sourceVersionId = readBodyText(body, "sourceVersionId");
  if (!sourceVersionId) {
    return apiError({ status: 400, code: "validation_failed", message: "חסרה גרסת מקור לטיוטה." });
  }

  const source = await loadVersion(sourceVersionId, "id, match_settings_id, version, status, weights, hard_filters, deal_breaker_filters, published_at, created_at");
  if (!source) {
    return apiError({ status: 404, code: "not_found", message: "הגרסה לא נמצאה." });
  }

  const supabase = createServiceRoleClient();
  const { data: maxRows, error: maxError } = await supabase
    .from(MATCH_SETTINGS_TABLE)
    .select("version")
    .eq("match_settings_id", source.match_settings_id)
    .order("version", { ascending: false })
    .limit(1)
    .returns<{ version: number }[]>();

  if (maxError) {
    return apiError({ status: 503, code: "schema_unavailable", message: "אי אפשר ליצור טיוטה כרגע." });
  }

  const { data: draft, error: insertError } = await supabase
    .from(MATCH_SETTINGS_TABLE)
    .insert(buildDraftVersionInsert({ source, maxVersion: maxRows?.[0]?.version ?? 0, omit: ["id", "created_at"] }))
    .select("id")
    .single<{ id: string }>();

  if (insertError || !draft) {
    return apiError({ status: 503, code: "schema_unavailable", message: "אי אפשר ליצור טיוטה כרגע." });
  }

  const audit = await insertAudit(actorUserId, "matching.settings.create_draft", draft.id, { sourceVersionId });
  if (audit) return audit;

  return apiSuccess({ versionId: draft.id }, { status: 201 });
}

export async function updateMatchSettingsDraft(actorUserId: string, versionId: string, body: unknown) {
  const target = await loadVersion(versionId, "id, status");
  if (!target) {
    return apiError({ status: 404, code: "not_found", message: "הגרסה לא נמצאה." });
  }

  try {
    validateDraftSaveTarget(target);
  } catch {
    return apiError({ status: 409, code: "version_not_editable", message: "אפשר לערוך רק טיוטות." });
  }

  let settings;
  try {
    const record = readBodyRecord(body);
    settings = validateMatchSettings({
      weights: readNumberRecord(record.weights),
      hardFilters: readStringArray(record.hardFilters),
      dealBreakerFilters: readStringArray(record.dealBreakerFilters),
    });
  } catch (error) {
    return apiError({
      status: 400,
      code: "validation_failed",
      message: "הגדרות ההתאמה אינן תקינות.",
      details: { reason: error instanceof Error ? error.message : "הגדרות ההתאמה אינן תקינות." },
    });
  }

  const supabase = createServiceRoleClient();
  const { error: updateError } = await supabase
    .from(MATCH_SETTINGS_TABLE)
    .update({
      weights: settings.weights,
      hard_filters: settings.hardFilters,
      deal_breaker_filters: settings.dealBreakerFilters,
    })
    .eq("id", versionId);

  if (updateError) {
    return apiError({ status: 503, code: "schema_unavailable", message: "אי אפשר לשמור את הטיוטה כרגע." });
  }

  const audit = await insertAudit(actorUserId, "matching.settings.update_draft", versionId);
  if (audit) return audit;

  return apiSuccess({ versionId });
}

export async function publishMatchSettingsVersion(actorUserId: string, versionId: string) {
  const target = await loadVersion(versionId, "id, match_settings_id, status");
  if (!target) {
    return apiError({ status: 404, code: "not_found", message: "הגרסה לא נמצאה." });
  }

  const supabase = createServiceRoleClient();
  const { data: siblings, error } = await supabase
    .from(MATCH_SETTINGS_TABLE)
    .select("id, status")
    .eq("match_settings_id", target.match_settings_id)
    .returns<MatchSettingsVersionRow[]>();

  if (error) {
    return apiError({ status: 503, code: "schema_unavailable", message: "אי אפשר לפרסם את הגרסה כרגע." });
  }

  let plan;
  try {
    plan = getSiblingPublishPlan({ target, siblings: siblings ?? [] });
  } catch {
    return apiError({ status: 409, code: "version_not_editable", message: "אפשר לפרסם רק טיוטה." });
  }

  if (plan.archiveVersionIds.length) {
    const { error: archiveError } = await supabase.from(MATCH_SETTINGS_TABLE).update({ status: "archived" }).in("id", plan.archiveVersionIds);
    if (archiveError) {
      return apiError({ status: 503, code: "schema_unavailable", message: "אי אפשר לפרסם את הגרסה כרגע." });
    }
  }

  const { error: publishError } = await supabase
    .from(MATCH_SETTINGS_TABLE)
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", plan.publishVersionId);

  if (publishError) {
    return apiError({ status: 503, code: "schema_unavailable", message: "אי אפשר לפרסם את הגרסה כרגע." });
  }

  const audit = await insertAudit(actorUserId, "matching.settings.publish", plan.publishVersionId, {
    archivedSiblingIds: plan.archiveVersionIds,
  });
  if (audit) return audit;

  return apiSuccess({ versionId: plan.publishVersionId });
}

export async function archiveMatchSettingsVersion(actorUserId: string, versionId: string) {
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
  const { error } = await supabase.from(MATCH_SETTINGS_TABLE).update({ status: "archived" }).eq("id", versionId);
  if (error) {
    return apiError({ status: 503, code: "schema_unavailable", message: "אי אפשר להעביר את הגרסה לארכיון כרגע." });
  }

  const audit = await insertAudit(actorUserId, "matching.settings.archive", versionId);
  if (audit) return audit;

  return apiSuccess({ versionId });
}

export async function rerunMatches(actorUserId: string, body: unknown) {
  const request = parseRerunRequest(body);
  if (!request) {
    return apiError({ status: 400, code: "invalid_rerun_request", message: "בקשת חישוב ההתאמות אינה תקינה." });
  }

  const supabase = createServiceRoleClient();
  let settings;
  try {
    settings = await loadPublishedMatchSettings(supabase);
  } catch {
    return apiError({ status: 503, code: "published_settings_missing", message: "אין גרסת הגדרות התאמה מפורסמת." });
  }

  const profiles = await loadMatchProfiles(supabase);
  const result =
    request.scope === "user"
      ? await rerunMatchesForUser({ supabase, userId: request.userId, settings, profiles })
      : await rerunMatchesGlobally({ supabase, settings, profiles });

  const audit = await insertAudit(
    actorUserId,
    request.scope === "user" ? "matching.rerun_user" : "matching.rerun_global",
    settings.versionId,
    request.scope === "user" ? { userId: request.userId, recalculated: result.recalculated } : { recalculated: result.recalculated },
  );
  if (audit) return audit;

  return apiSuccess(result);
}

async function loadVersion(versionId: string, select: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from(MATCH_SETTINGS_TABLE)
    .select(select)
    .eq("id", versionId)
    .maybeSingle<MatchSettingsVersionRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function insertAudit(actorUserId: string, action: string, targetId?: string, metadata?: Record<string, unknown>) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("admin_audit_logs").insert(
    buildAuditLog({
      actorUserId,
      action,
      targetTable: MATCH_SETTINGS_TABLE,
      targetId,
      metadata,
    }),
  );

  return error
    ? apiError({ status: 503, code: "schema_unavailable", message: "הפעולה הצליחה אבל רישום הביקורת נכשל." })
    : null;
}

function parseRerunRequest(body: unknown): { scope: "global" } | { scope: "user"; userId: string } | null {
  const record = readBodyRecord(body);
  if (record.scope === "global") {
    return { scope: "global" };
  }

  if (record.scope === "user" && typeof record.userId === "string" && record.userId.trim()) {
    return { scope: "user", userId: record.userId.trim() };
  }

  return null;
}

function readBodyRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readBodyText(value: unknown, key: string) {
  const record = readBodyRecord(value);
  return typeof record[key] === "string" ? record[key].trim() : "";
}

function readNumberRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, numberValue]) => [key, Number(numberValue)]));
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter((item) => item.trim()) : [];
}
