"use server";

import {
  buildDraftCreateAuditLog,
  buildDraftSaveAuditLog,
  buildDraftVersionInsert,
  buildVersionArchiveAuditLog,
  buildVersionPublishAuditLog,
  getSiblingPublishPlan,
  validateDraftSaveTarget,
  validateArchiveTarget,
  type VersionStatus,
} from "@/domain/admin/version-operations";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { requireAdminActionActor } from "./guard";

export type VersionActionConfig = {
  table: string;
  groupColumn: string;
  path: string;
};

type TargetRow = {
  id: string;
  status: VersionStatus;
  [key: string]: unknown;
};

export async function publishVersionAction(formData: FormData, config: VersionActionConfig) {
  const actor = await requireAdminActionActor();
  const versionId = String(formData.get("versionId") ?? "");

  if (!versionId) {
    throw new Error("חסר מזהה גרסה.");
  }

  const supabase = createServiceRoleClient();
  const { data: target, error: targetError } = await supabase
    .from(config.table)
    .select(`id, status, ${config.groupColumn}`)
    .eq("id", versionId)
    .maybeSingle<TargetRow>();

  if (targetError) {
    throw new Error(targetError.message);
  }
  if (!target) {
    throw new Error("הגרסה לא נמצאה.");
  }

  const groupValue = target[config.groupColumn];
  if (typeof groupValue !== "string") {
    throw new Error("קבוצת הגרסה לא נמצאה.");
  }

  const { data: siblings, error: siblingsError } = await supabase
    .from(config.table)
    .select("id, status")
    .eq(config.groupColumn, groupValue)
    .returns<TargetRow[]>();

  if (siblingsError) {
    throw new Error(siblingsError.message);
  }

  const plan = getSiblingPublishPlan({ target, siblings: siblings ?? [] });
  const now = new Date().toISOString();

  if (plan.archiveVersionIds.length > 0) {
    const { error: archiveSiblingsError } = await supabase
      .from(config.table)
      .update({ status: "archived" })
      .in("id", plan.archiveVersionIds);

    if (archiveSiblingsError) {
      throw new Error(archiveSiblingsError.message);
    }
  }

  const { error: publishError } = await supabase
    .from(config.table)
    .update({ status: "published", published_at: now })
    .eq("id", plan.publishVersionId);

  if (publishError) {
    throw new Error(publishError.message);
  }

  const { error: auditError } = await supabase.from("admin_audit_logs").insert(
    buildVersionPublishAuditLog({
      actorUserId: actor.userId,
      targetTable: config.table,
      targetId: plan.publishVersionId,
      archivedSiblingIds: plan.archiveVersionIds,
    }),
  );

  if (auditError) {
    throw new Error(auditError.message);
  }

  revalidatePath(config.path);
}

export async function createDraftVersionAction(
  formData: FormData,
  config: VersionActionConfig & {
    select: string;
    omit?: string[];
    editorPath: (versionId: string) => string;
  },
) {
  const actor = await requireAdminActionActor();
  const sourceVersionId = String(formData.get("versionId") ?? "");

  if (!sourceVersionId) {
    throw new Error("חסר מזהה גרסה.");
  }

  const supabase = createServiceRoleClient();
  const { data: source, error: sourceError } = await supabase
    .from(config.table)
    .select(config.select)
    .eq("id", sourceVersionId)
    .maybeSingle<Record<string, unknown>>();

  if (sourceError) {
    throw new Error(sourceError.message);
  }
  if (!source) {
    throw new Error("הגרסה לא נמצאה.");
  }

  const groupValue = source[config.groupColumn];
  if (typeof groupValue !== "string") {
    throw new Error("קבוצת הגרסה לא נמצאה.");
  }

  const { data: maxRows, error: maxError } = await supabase
    .from(config.table)
    .select("version")
    .eq(config.groupColumn, groupValue)
    .order("version", { ascending: false })
    .limit(1)
    .returns<{ version: number }[]>();

  if (maxError) {
    throw new Error(maxError.message);
  }

  const maxVersion = maxRows?.[0]?.version ?? 0;
  const draftInsert = buildDraftVersionInsert({
    source,
    maxVersion,
    omit: ["id", "created_at", ...(config.omit ?? [])],
  });

  const { data: draft, error: insertError } = await supabase
    .from(config.table)
    .insert(draftInsert)
    .select("id")
    .single<{ id: string }>();

  if (insertError) {
    throw new Error(insertError.message);
  }

  const { error: auditError } = await supabase.from("admin_audit_logs").insert(
    buildDraftCreateAuditLog({
      actorUserId: actor.userId,
      targetTable: config.table,
      sourceVersionId,
      draftVersionId: draft.id,
    }),
  );

  if (auditError) {
    throw new Error(auditError.message);
  }

  revalidatePath(config.path);
  revalidatePath(config.editorPath(draft.id));
}

export async function saveDirectDraftVersionAction(
  formData: FormData,
  config: VersionActionConfig & {
    payload: (formData: FormData) => Record<string, unknown>;
    editorPath: (versionId: string) => string;
  },
) {
  const actor = await requireAdminActionActor();
  const versionId = String(formData.get("versionId") ?? "");

  if (!versionId) {
    throw new Error("חסר מזהה גרסה.");
  }

  const supabase = createServiceRoleClient();
  const { data: target, error: targetError } = await supabase
    .from(config.table)
    .select("id, status")
    .eq("id", versionId)
    .maybeSingle<TargetRow>();

  if (targetError) {
    throw new Error(targetError.message);
  }
  if (!target) {
    throw new Error("הגרסה לא נמצאה.");
  }

  validateDraftSaveTarget(target);

  const { error: updateError } = await supabase.from(config.table).update(config.payload(formData)).eq("id", versionId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: auditError } = await supabase.from("admin_audit_logs").insert(
    buildDraftSaveAuditLog({
      actorUserId: actor.userId,
      targetTable: config.table,
      draftVersionId: versionId,
    }),
  );

  if (auditError) {
    throw new Error(auditError.message);
  }

  revalidatePath(config.path);
  revalidatePath(config.editorPath(versionId));
}

export async function archiveVersionAction(formData: FormData, config: VersionActionConfig) {
  const actor = await requireAdminActionActor();
  const versionId = String(formData.get("versionId") ?? "");

  if (!versionId) {
    throw new Error("חסר מזהה גרסה.");
  }

  const supabase = createServiceRoleClient();
  const { data: target, error: targetError } = await supabase
    .from(config.table)
    .select("id, status")
    .eq("id", versionId)
    .maybeSingle<TargetRow>();

  if (targetError) {
    throw new Error(targetError.message);
  }
  if (!target) {
    throw new Error("הגרסה לא נמצאה.");
  }

  validateArchiveTarget(target);

  const { error: archiveError } = await supabase.from(config.table).update({ status: "archived" }).eq("id", versionId);

  if (archiveError) {
    throw new Error(archiveError.message);
  }

  const { error: auditError } = await supabase.from("admin_audit_logs").insert(
    buildVersionArchiveAuditLog({
      actorUserId: actor.userId,
      targetTable: config.table,
      targetId: versionId,
    }),
  );

  if (auditError) {
    throw new Error(auditError.message);
  }

  revalidatePath(config.path);
}
