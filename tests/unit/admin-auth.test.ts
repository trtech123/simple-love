import { describe, expect, it } from "vitest";
import { assertAdminRole } from "../../src/domain/admin/auth";
import { buildAuditLog } from "../../src/domain/admin/audit";

describe("admin authorization", () => {
  it("allows users with admin role", () => {
    expect(() => assertAdminRole({ userId: "u1", role: "admin" })).not.toThrow();
  });

  it("rejects non-admin users", () => {
    expect(() => assertAdminRole({ userId: "u1", role: "user" })).toThrow("Admin access required");
  });

  it("builds audit log entries for admin mutations", () => {
    expect(
      buildAuditLog({
        actorUserId: "admin-1",
        action: "questionnaire.publish",
        targetTable: "questionnaire_versions",
        targetId: "version-1",
        metadata: { version: 2 },
      }),
    ).toEqual({
      actor_user_id: "admin-1",
      action: "questionnaire.publish",
      target_table: "questionnaire_versions",
      target_id: "version-1",
      metadata: { version: 2 },
    });
  });
});
