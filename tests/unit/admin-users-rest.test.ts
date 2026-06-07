import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminRestState, createFakeAdminSupabase, jsonRequest } from "./admin-rest-fake-supabase";

const state = createAdminRestState();

describe("/api/admin/users", () => {
  beforeEach(() => {
    vi.resetModules();
    state.user = { id: "admin-1", app_metadata: { role: "admin" } };
    state.tables = {
      admin_audit_logs: [],
      profiles: [
        {
          user_id: "user-1",
          display_name: "דנה",
          disabled_at: null,
          created_at: "2026-06-06T09:00:00.000Z",
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

  it("rejects non-admin users", async () => {
    state.user = { id: "user-2", app_metadata: { role: "user" } };
    const { GET } = await import("../../src/app/api/admin/users/route");

    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "forbidden" });
  });

  it("lists and loads users", async () => {
    const { GET: list } = await import("../../src/app/api/admin/users/route");
    const listResponse = await list();
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({ ok: true, data: { users: [{ user_id: "user-1" }] } });

    const { GET: detail } = await import("../../src/app/api/admin/users/[userId]/route");
    const detailResponse = await detail(new Request("http://localhost/api/admin/users/user-1"), {
      params: Promise.resolve({ userId: "user-1" }),
    });
    expect(detailResponse.status).toBe(200);
    await expect(detailResponse.json()).resolves.toMatchObject({ ok: true, data: { user: { user_id: "user-1" } } });
  });

  it("disables and enables users with audit logs", async () => {
    const { POST: disable } = await import("../../src/app/api/admin/users/[userId]/disable/route");
    const disabled = await disable(jsonRequest("http://localhost/api/admin/users/user-1/disable", "POST"), {
      params: Promise.resolve({ userId: "user-1" }),
    });
    expect(disabled.status).toBe(200);
    expect(state.tables.profiles[0].disabled_at).toEqual(expect.any(String));

    const { POST: enable } = await import("../../src/app/api/admin/users/[userId]/enable/route");
    const enabled = await enable(jsonRequest("http://localhost/api/admin/users/user-1/enable", "POST"), {
      params: Promise.resolve({ userId: "user-1" }),
    });
    expect(enabled.status).toBe(200);
    expect(state.tables.profiles[0].disabled_at).toBeNull();
    expect(state.tables.admin_audit_logs).toContainEqual(expect.objectContaining({ action: "users.disable" }));
    expect(state.tables.admin_audit_logs).toContainEqual(expect.objectContaining({ action: "users.enable" }));
  });
});
