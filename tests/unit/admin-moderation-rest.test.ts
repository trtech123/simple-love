import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminRestState, createFakeAdminSupabase, jsonRequest } from "./admin-rest-fake-supabase";

const state = createAdminRestState();

describe("/api/admin/moderation", () => {
  beforeEach(() => {
    vi.resetModules();
    state.user = { id: "admin-1", app_metadata: { role: "admin" } };
    state.tables = {
      admin_audit_logs: [],
      user_reports: [
        {
          id: "report-1",
          reporter_id: "user-1",
          reported_user_id: "user-2",
          conversation_id: "conversation-1",
          reason: "spam",
          status: "open",
          created_at: "2026-06-06T09:00:00.000Z",
        },
      ],
      conversations: [{ id: "conversation-1", status: "active", updated_at: "2026-06-06T09:00:00.000Z" }],
      messages: [
        {
          id: "message-1",
          conversation_id: "conversation-1",
          sender_id: "user-2",
          body: "unsafe message",
          created_at: "2026-06-06T09:01:00.000Z",
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

  it("rejects unauthenticated moderation report access", async () => {
    state.user = null;
    const { GET } = await import("../../src/app/api/admin/moderation/reports/route");

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "authentication_required" });
  });

  it("lists moderation reports", async () => {
    const { GET } = await import("../../src/app/api/admin/moderation/reports/route");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, data: { reports: [{ id: "report-1" }] } });
  });

  it("disables conversations once and writes audit", async () => {
    const { POST } = await import("../../src/app/api/admin/moderation/conversations/[conversationId]/disable/route");

    const response = await POST(
      jsonRequest("http://localhost/api/admin/moderation/conversations/conversation-1/disable", "POST"),
      { params: Promise.resolve({ conversationId: "conversation-1" }) },
    );

    expect(response.status).toBe(200);
    expect(state.tables.conversations[0].status).toBe("disabled");
    expect(state.tables.admin_audit_logs).toContainEqual(
      expect.objectContaining({ action: "moderation.conversation.disable", target_id: "conversation-1" }),
    );

    const repeated = await POST(
      jsonRequest("http://localhost/api/admin/moderation/conversations/conversation-1/disable", "POST"),
      { params: Promise.resolve({ conversationId: "conversation-1" }) },
    );
    expect(repeated.status).toBe(409);
  });

  it("returns conversation messages to admins and audits content review", async () => {
    const { GET } = await import("../../src/app/api/admin/moderation/conversations/[conversationId]/messages/route");

    const response = await GET(
      new Request("http://localhost/api/admin/moderation/conversations/conversation-1/messages?reportId=report-1"),
      { params: Promise.resolve({ conversationId: "conversation-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        messages: [
          {
            id: "message-1",
            senderId: "user-2",
            body: "unsafe message",
            createdAt: "2026-06-06T09:01:00.000Z",
          },
        ],
      },
    });
    expect(state.tables.admin_audit_logs).toContainEqual(
      expect.objectContaining({
        action: "moderation.messages.view",
        target_table: "conversations",
        target_id: "conversation-1",
        metadata: { reportId: "report-1", messageCount: 1 },
      }),
    );
  });

  it("rejects message review for non-admin users", async () => {
    state.user = { id: "user-1", app_metadata: { role: "user" } };
    const { GET } = await import("../../src/app/api/admin/moderation/conversations/[conversationId]/messages/route");

    const response = await GET(new Request("http://localhost/api/admin/moderation/conversations/conversation-1/messages"), {
      params: Promise.resolve({ conversationId: "conversation-1" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "forbidden" });
  });
});
