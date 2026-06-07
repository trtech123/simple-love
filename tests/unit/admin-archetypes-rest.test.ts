import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminRestState, createFakeAdminSupabase, jsonRequest } from "./admin-rest-fake-supabase";

const state = createAdminRestState();

describe("/api/admin/archetypes", () => {
  beforeEach(() => {
    vi.resetModules();
    state.user = { id: "admin-1", app_metadata: { role: "admin" } };
    state.tables = {
      admin_audit_logs: [],
      archetype_versions: [
        {
          id: "arch-published",
          archetype_id: "arch-1",
          version: 1,
          status: "published",
          name: "חם נסגר",
          short_description: "קצר",
          full_description: "מלא",
          matching_meaning: "התאמה",
          scoring_rules: {},
          published_at: "2026-06-06T10:00:00.000Z",
          created_at: "2026-06-06T09:00:00.000Z",
        },
        {
          id: "arch-draft",
          archetype_id: "arch-1",
          version: 2,
          status: "draft",
          name: "חם נסגר",
          short_description: "קצר",
          full_description: "מלא",
          matching_meaning: "התאמה",
          scoring_rules: {},
          published_at: null,
          created_at: "2026-06-06T11:00:00.000Z",
        },
      ],
    };
    state.tableErrors = {};
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user }, error: null }) } }),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createServiceRoleClient: () => createFakeAdminSupabase(state),
    }));
  });

  it("rejects non-admin requests", async () => {
    state.user = { id: "user-1", app_metadata: { role: "user" } };
    const { GET } = await import("../../src/app/api/admin/archetypes/route");

    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "forbidden" });
  });

  it("lists versions and rejects invalid draft saves", async () => {
    const { GET } = await import("../../src/app/api/admin/archetypes/route");
    const list = await GET();
    expect(list.status).toBe(200);
    const body = await list.json();
    expect(body).toMatchObject({ ok: true });
    expect(body.data.versions).toContainEqual(expect.objectContaining({ id: "arch-published" }));

    const { PUT } = await import("../../src/app/api/admin/archetypes/[versionId]/route");
    const invalid = await PUT(
      jsonRequest("http://localhost/api/admin/archetypes/arch-draft", "PUT", {
        name: "",
        shortDescription: "קצר",
        fullDescription: "מלא",
        matchingMeaning: "התאמה",
        scoringRules: {},
      }),
      { params: Promise.resolve({ versionId: "arch-draft" }) },
    );
    expect(invalid.status).toBe(400);
  });

  it("saves a draft and writes audit", async () => {
    const { PUT } = await import("../../src/app/api/admin/archetypes/[versionId]/route");

    const response = await PUT(
      jsonRequest("http://localhost/api/admin/archetypes/arch-draft", "PUT", {
        name: "יציב פתוח",
        shortDescription: "קצר",
        fullDescription: "מלא",
        matchingMeaning: "התאמה",
        scoringRules: { q1: "a" },
      }),
      { params: Promise.resolve({ versionId: "arch-draft" }) },
    );

    expect(response.status).toBe(200);
    expect(state.tables.archetype_versions.find((row) => row.id === "arch-draft")).toMatchObject({
      name: "יציב פתוח",
      scoring_rules: { q1: "a" },
    });
    expect(state.tables.admin_audit_logs).toContainEqual(
      expect.objectContaining({ action: "archetype_versions.save_draft", target_id: "arch-draft" }),
    );
  });
});
