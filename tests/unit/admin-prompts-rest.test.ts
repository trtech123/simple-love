import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminRestState, createFakeAdminSupabase, jsonRequest } from "./admin-rest-fake-supabase";

const state = createAdminRestState();

describe("/api/admin/prompts", () => {
  beforeEach(() => {
    vi.resetModules();
    state.user = { id: "admin-1", app_metadata: { role: "admin" } };
    state.tables = {
      admin_audit_logs: [],
      prompt_versions: [
        {
          id: "prompt-published",
          slug: "paid-report-v1",
          version: 1,
          status: "published",
          template: "{{displayName}} {{answersJson}} {{archetypeName}}",
          model: "gpt-4.1-mini",
          model_settings: { temperature: 0.4 },
          published_at: "2026-06-06T10:00:00.000Z",
          created_at: "2026-06-06T09:00:00.000Z",
        },
        {
          id: "prompt-draft",
          slug: "paid-report-v1",
          version: 2,
          status: "draft",
          template: "{{displayName}} {{answersJson}} {{archetypeName}}",
          model: "gpt-4.1-mini",
          model_settings: {},
          published_at: null,
          created_at: "2026-06-06T11:00:00.000Z",
        },
      ],
    };
    state.rpcCalls = [];
    state.tableErrors = {};
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user }, error: null }) } }),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createServiceRoleClient: () => createFakeAdminSupabase(state),
    }));
  });

  it("rejects unauthenticated list requests", async () => {
    state.user = null;
    const { GET } = await import("../../src/app/api/admin/prompts/route");

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "authentication_required" });
  });

  it("validates prompt saves and writes audit on success", async () => {
    const { PUT } = await import("../../src/app/api/admin/prompts/[versionId]/route");

    const invalid = await PUT(
      jsonRequest("http://localhost/api/admin/prompts/prompt-draft", "PUT", {
        template: "{{displayName}}",
        model: "gpt-4.1-mini",
        modelSettings: {},
      }),
      { params: Promise.resolve({ versionId: "prompt-draft" }) },
    );
    expect(invalid.status).toBe(400);

    const response = await PUT(
      jsonRequest("http://localhost/api/admin/prompts/prompt-draft", "PUT", {
        template: "{{displayName}} {{answersJson}} {{archetypeName}}",
        model: "gpt-4.1",
        modelSettings: { temperature: 0.2 },
      }),
      { params: Promise.resolve({ versionId: "prompt-draft" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, data: { versionId: "prompt-draft" } });
    expect(state.tables.prompt_versions.find((row) => row.id === "prompt-draft")).toMatchObject({
      model: "gpt-4.1",
      model_settings: { temperature: 0.2 },
    });
    expect(state.tables.admin_audit_logs).toContainEqual(
      expect.objectContaining({ action: "prompt_versions.save_draft", target_id: "prompt-draft" }),
    );
  });

  it("creates, publishes, and archives with success envelopes", async () => {
    const { POST: create } = await import("../../src/app/api/admin/prompts/route");
    const created = await create(
      jsonRequest("http://localhost/api/admin/prompts", "POST", { sourceVersionId: "prompt-published" }),
    );
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({ ok: true, data: { versionId: expect.any(String) } });

    const { POST: publish } = await import("../../src/app/api/admin/prompts/[versionId]/publish/route");
    const published = await publish(jsonRequest("http://localhost/api/admin/prompts/prompt-draft/publish", "POST"), {
      params: Promise.resolve({ versionId: "prompt-draft" }),
    });
    expect(published.status).toBe(200);
    expect(state.tables.prompt_versions.find((row) => row.id === "prompt-published")?.status).toBe("archived");

    const { POST: archive } = await import("../../src/app/api/admin/prompts/[versionId]/archive/route");
    const archived = await archive(jsonRequest("http://localhost/api/admin/prompts/prompt-draft/archive", "POST"), {
      params: Promise.resolve({ versionId: "prompt-draft" }),
    });
    expect(archived.status).toBe(200);
  });
});
