import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminRestState, createFakeAdminSupabase, jsonRequest } from "./admin-rest-fake-supabase";

const state = createAdminRestState();

const validDraft = {
  title: "שאלון עומק",
  purpose: "paid_report",
  blocks: [
    {
      title: "פתיחה",
      questions: [
        {
          stableKey: "q1",
          prompt: "מה חשוב לך?",
          questionType: "multiple_choice",
          options: [
            { label: "א", value: "a" },
            { label: "ב", value: "b" },
          ],
          usageFlags: { aiReportInput: true },
        },
      ],
    },
  ],
};

describe("/api/admin/questionnaires", () => {
  beforeEach(() => {
    vi.resetModules();
    state.user = { id: "admin-1", app_metadata: { role: "admin" } };
    state.tables = {
      admin_audit_logs: [],
      questionnaire_versions: [
        {
          id: "questionnaire-published",
          questionnaire_id: "questionnaire-1",
          version: 1,
          status: "published",
          published_at: "2026-06-06T10:00:00.000Z",
          created_at: "2026-06-06T09:00:00.000Z",
        },
        {
          id: "questionnaire-draft",
          questionnaire_id: "questionnaire-1",
          version: 2,
          status: "draft",
          published_at: null,
          created_at: "2026-06-06T11:00:00.000Z",
        },
      ],
      questionnaire_blocks: [
        {
          id: "block-1",
          questionnaire_version_id: "questionnaire-published",
          title: "פתיחה",
          position: 1,
          questions: [
            {
              stable_key: "q1",
              prompt: "מה חשוב לך?",
              question_type: "open_text",
              position: 1,
              usage_flags: { aiReportInput: true },
              question_options: [],
            },
          ],
        },
      ],
      questions: [],
      question_options: [],
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

  it("rejects unauthenticated requests", async () => {
    state.user = null;
    const { GET } = await import("../../src/app/api/admin/questionnaires/route");

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "authentication_required" });
  });

  it("creates a copied draft and writes audit", async () => {
    const { POST } = await import("../../src/app/api/admin/questionnaires/route");

    const response = await POST(
      jsonRequest("http://localhost/api/admin/questionnaires", "POST", {
        sourceVersionId: "questionnaire-published",
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ ok: true, data: { versionId: expect.any(String) } });
    expect(state.tables.questionnaire_blocks).toHaveLength(2);
    expect(state.tables.admin_audit_logs).toContainEqual(
      expect.objectContaining({ action: "questionnaire_versions.create_draft" }),
    );
  });

  it("validates draft saves, calls the replacement RPC, and writes audit", async () => {
    const { PUT } = await import("../../src/app/api/admin/questionnaires/[versionId]/route");

    const invalid = await PUT(
      jsonRequest("http://localhost/api/admin/questionnaires/questionnaire-draft", "PUT", {
        ...validDraft,
        blocks: [{ ...validDraft.blocks[0], questions: [{ ...validDraft.blocks[0].questions[0], options: [] }] }],
      }),
      { params: Promise.resolve({ versionId: "questionnaire-draft" }) },
    );
    expect(invalid.status).toBe(400);

    const response = await PUT(
      jsonRequest("http://localhost/api/admin/questionnaires/questionnaire-draft", "PUT", validDraft),
      { params: Promise.resolve({ versionId: "questionnaire-draft" }) },
    );

    expect(response.status).toBe(200);
    expect(state.rpcCalls).toContainEqual(
      expect.objectContaining({ name: "replace_draft_questionnaire_version" }),
    );
    expect(state.tables.admin_audit_logs).toContainEqual(
      expect.objectContaining({ action: "questionnaire_versions.save_draft", target_id: "questionnaire-draft" }),
    );
  });
});
