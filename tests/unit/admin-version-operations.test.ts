import { describe, expect, it } from "vitest";
import {
  buildDraftCreateAuditLog,
  buildDraftSaveAuditLog,
  buildDraftVersionInsert,
  buildVersionArchiveAuditLog,
  buildVersionPublishAuditLog,
  getSiblingPublishPlan,
  requireAdminActorFromUser,
  validateDraftSaveTarget,
  validateArchiveTarget,
  validatePublishTarget,
} from "../../src/domain/admin/version-operations";

describe("admin version operations", () => {
  it("returns actor data for admins and rejects non-admin users", () => {
    expect(
      requireAdminActorFromUser({
        id: "admin-1",
        app_metadata: { role: "admin" },
      }),
    ).toEqual({ userId: "admin-1", role: "admin" });

    expect(() =>
      requireAdminActorFromUser({
        id: "user-1",
        app_metadata: { role: "user" },
      }),
    ).toThrow("Admin access required");
  });

  it("allows publishing only draft targets", () => {
    expect(() => validatePublishTarget({ id: "version-1", status: "draft" })).not.toThrow();
    expect(() => validatePublishTarget({ id: "version-1", status: "published" })).toThrow(
      "Only draft versions can be published",
    );
  });

  it("archives sibling published versions when publishing a draft", () => {
    expect(
      getSiblingPublishPlan({
        target: { id: "draft-1", status: "draft" },
        siblings: [
          { id: "published-1", status: "published" },
          { id: "draft-1", status: "draft" },
          { id: "archived-1", status: "archived" },
        ],
      }),
    ).toEqual({
      publishVersionId: "draft-1",
      archiveVersionIds: ["published-1"],
    });
  });

  it("archives only non-archived targets", () => {
    expect(() => validateArchiveTarget({ id: "version-1", status: "draft" })).not.toThrow();
    expect(() => validateArchiveTarget({ id: "version-1", status: "published" })).not.toThrow();
    expect(() => validateArchiveTarget({ id: "version-1", status: "archived" })).toThrow(
      "Archived versions cannot be archived again",
    );
  });

  it("builds draft version inserts from a source and the family max version", () => {
    expect(
      buildDraftVersionInsert({
        source: {
          id: "source-1",
          slug: "report",
          version: 2,
          status: "published",
          published_at: "2026-06-01T10:00:00.000Z",
          template: "body",
        },
        maxVersion: 4,
        omit: ["id"],
      }),
    ).toEqual({
      slug: "report",
      version: 5,
      status: "draft",
      published_at: null,
      template: "body",
    });
  });

  it("allows saving only draft targets", () => {
    expect(() => validateDraftSaveTarget({ id: "version-1", status: "draft" })).not.toThrow();
    expect(() => validateDraftSaveTarget({ id: "version-1", status: "published" })).toThrow(
      "Only draft versions can be edited",
    );
    expect(() => validateDraftSaveTarget({ id: "version-1", status: "archived" })).toThrow(
      "Only draft versions can be edited",
    );
  });

  it("builds publish and archive audit logs", () => {
    expect(
      buildVersionPublishAuditLog({
        actorUserId: "admin-1",
        targetTable: "prompt_versions",
        targetId: "version-1",
        archivedSiblingIds: ["version-0"],
      }),
    ).toMatchObject({
      actor_user_id: "admin-1",
      action: "prompt_versions.publish",
      target_table: "prompt_versions",
      target_id: "version-1",
      metadata: { archivedSiblingIds: ["version-0"] },
    });

    expect(
      buildVersionArchiveAuditLog({
        actorUserId: "admin-1",
        targetTable: "prompt_versions",
        targetId: "version-1",
      }).action,
    ).toBe("prompt_versions.archive");
  });

  it("builds draft create and save audit logs", () => {
    expect(
      buildDraftCreateAuditLog({
        actorUserId: "admin-1",
        targetTable: "prompt_versions",
        sourceVersionId: "source-1",
        draftVersionId: "draft-1",
      }),
    ).toMatchObject({
      actor_user_id: "admin-1",
      action: "prompt_versions.create_draft",
      target_table: "prompt_versions",
      target_id: "draft-1",
      metadata: { sourceVersionId: "source-1", draftVersionId: "draft-1" },
    });

    expect(
      buildDraftSaveAuditLog({
        actorUserId: "admin-1",
        targetTable: "prompt_versions",
        draftVersionId: "draft-1",
      }),
    ).toMatchObject({
      action: "prompt_versions.save_draft",
      target_id: "draft-1",
      metadata: { draftVersionId: "draft-1" },
    });
  });
});
