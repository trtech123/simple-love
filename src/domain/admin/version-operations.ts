import { assertAdminRole, type AdminActor } from "./auth";
import { buildAuditLog } from "./audit";

export type VersionStatus = "draft" | "published" | "archived";

export type VersionRow = {
  id: string;
  status: VersionStatus;
};

export function requireAdminActorFromUser(user: {
  id: string;
  app_metadata?: Record<string, unknown> | null;
}): AdminActor & { role: "admin" } {
  const actor = {
    userId: user.id,
    role: typeof user.app_metadata?.role === "string" ? user.app_metadata.role : null,
  };
  assertAdminRole(actor);
  return actor;
}

export function validatePublishTarget(target: VersionRow) {
  if (target.status !== "draft") {
    throw new Error("Only draft versions can be published");
  }
}

export function validateArchiveTarget(target: VersionRow) {
  if (target.status === "archived") {
    throw new Error("Archived versions cannot be archived again");
  }
}

export function validateDraftSaveTarget(target: VersionRow) {
  if (target.status !== "draft") {
    throw new Error("Only draft versions can be edited");
  }
}

export function buildDraftVersionInsert<T extends Record<string, unknown>>(input: {
  source: T;
  maxVersion: number;
  omit?: (keyof T)[];
}) {
  const omit = new Set<keyof T>(["id" as keyof T, ...(input.omit ?? [])]);
  const draft = Object.fromEntries(Object.entries(input.source).filter(([key]) => !omit.has(key as keyof T)));

  return {
    ...draft,
    version: input.maxVersion + 1,
    status: "draft",
    published_at: null,
  };
}

export function getSiblingPublishPlan(input: { target: VersionRow; siblings: VersionRow[] }) {
  validatePublishTarget(input.target);

  return {
    publishVersionId: input.target.id,
    archiveVersionIds: input.siblings
      .filter((sibling) => sibling.id !== input.target.id && sibling.status === "published")
      .map((sibling) => sibling.id),
  };
}

export function buildVersionPublishAuditLog(input: {
  actorUserId: string;
  targetTable: string;
  targetId: string;
  archivedSiblingIds: string[];
}) {
  return buildAuditLog({
    actorUserId: input.actorUserId,
    action: `${input.targetTable}.publish`,
    targetTable: input.targetTable,
    targetId: input.targetId,
    metadata: {
      archivedSiblingIds: input.archivedSiblingIds,
    },
  });
}

export function buildVersionArchiveAuditLog(input: {
  actorUserId: string;
  targetTable: string;
  targetId: string;
}) {
  return buildAuditLog({
    actorUserId: input.actorUserId,
    action: `${input.targetTable}.archive`,
    targetTable: input.targetTable,
    targetId: input.targetId,
  });
}

export function buildDraftCreateAuditLog(input: {
  actorUserId: string;
  targetTable: string;
  sourceVersionId: string;
  draftVersionId: string;
}) {
  return buildAuditLog({
    actorUserId: input.actorUserId,
    action: `${input.targetTable}.create_draft`,
    targetTable: input.targetTable,
    targetId: input.draftVersionId,
    metadata: {
      sourceVersionId: input.sourceVersionId,
      draftVersionId: input.draftVersionId,
    },
  });
}

export function buildDraftSaveAuditLog(input: {
  actorUserId: string;
  targetTable: string;
  draftVersionId: string;
}) {
  return buildAuditLog({
    actorUserId: input.actorUserId,
    action: `${input.targetTable}.save_draft`,
    targetTable: input.targetTable,
    targetId: input.draftVersionId,
    metadata: {
      draftVersionId: input.draftVersionId,
    },
  });
}
