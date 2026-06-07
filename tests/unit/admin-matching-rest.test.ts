import { beforeEach, describe, expect, it, vi } from "vitest";

type Version = {
  id: string;
  match_settings_id: string;
  version: number;
  status: "draft" | "published" | "archived";
  weights: Record<string, number>;
  hard_filters: string[];
  deal_breaker_filters: string[];
  published_at: string | null;
  created_at: string;
};

const state = {
  user: { id: "admin-1", app_metadata: { role: "admin" } } as null | {
    id: string;
    app_metadata?: Record<string, unknown>;
  },
  versions: [
    {
      id: "settings-v2",
      match_settings_id: "settings-1",
      version: 2,
      status: "published",
      weights: { emotional_profile: 100 },
      hard_filters: ["gender"],
      deal_breaker_filters: ["smoking"],
      published_at: "2026-06-06T10:00:00.000Z",
      created_at: "2026-06-06T09:00:00.000Z",
    },
  ] as Version[],
  auditLogs: [] as Record<string, unknown>[],
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.user },
        error: null,
      }),
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: () => createFakeSupabase(),
}));

vi.mock("../../src/domain/matching/rerun", () => ({
  loadMatchProfiles: vi.fn(() => Promise.resolve([profile("user-a"), profile("user-b")])),
  rerunMatchesForUser: vi.fn(() => Promise.resolve({ recalculated: 1, settingsVersionId: "settings-v2" })),
  rerunMatchesGlobally: vi.fn(() => Promise.resolve({ recalculated: 2, settingsVersionId: "settings-v2" })),
}));

function createFakeSupabase() {
  return {
    from(table: string) {
      return createTableBuilder(table);
    },
  };
}

function createTableBuilder(table: string) {
  const filters: Record<string, unknown> = {};
  let insertPayload: unknown;
  let updatePayload: Record<string, unknown> | null = null;

  const builder = {
    select() {
      return builder;
    },
    eq(column: string, value: unknown) {
      filters[column] = value;
      if (table === "match_settings_versions" && updatePayload) {
        state.versions = state.versions.map((version) =>
          version.id === value ? ({ ...version, ...updatePayload } as Version) : version,
        );
      }
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return builder;
    },
    insert(payload: unknown) {
      insertPayload = payload;
      if (table === "admin_audit_logs") {
        state.auditLogs.push(payload as Record<string, unknown>);
      }
      return builder;
    },
    update(payload: Record<string, unknown>) {
      updatePayload = payload;
      return builder;
    },
    in(column: string, values: unknown[]) {
      if (table === "match_settings_versions" && column === "id" && updatePayload) {
        state.versions = state.versions.map((version) =>
          values.includes(version.id) ? ({ ...version, ...updatePayload } as Version) : version,
        );
      }
      return builder;
    },
    async maybeSingle() {
      if (table === "match_settings_versions") {
        return {
          data:
            state.versions.find((version) =>
              Object.entries(filters).every(([key, value]) => version[key as keyof Version] === value),
            ) ?? null,
          error: null,
        };
      }
      return { data: null, error: null };
    },
    async single() {
      if (table === "match_settings_versions" && insertPayload) {
        const draft = { ...(insertPayload as Partial<Version>), id: "settings-draft-3" } as Version;
        state.versions.push(draft);
        return { data: { id: draft.id }, error: null };
      }
      return { data: null, error: null };
    },
    async returns() {
      if (table === "match_settings_versions") {
        return { data: state.versions, error: null };
      }
      return { data: [], error: null };
    },
    then(resolve: (value: { error: null }) => void) {
      resolve({ error: null });
    },
  };

  return builder;
}

function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("/api/admin/matching", () => {
  beforeEach(() => {
    vi.resetModules();
    state.user = { id: "admin-1", app_metadata: { role: "admin" } };
    state.versions = [
      {
        id: "settings-v2",
        match_settings_id: "settings-1",
        version: 2,
        status: "published",
        weights: { emotional_profile: 100 },
        hard_filters: ["gender"],
        deal_breaker_filters: ["smoking"],
        published_at: "2026-06-06T10:00:00.000Z",
        created_at: "2026-06-06T09:00:00.000Z",
      },
    ];
    state.auditLogs = [];
  });

  it("rejects non-admin requests", async () => {
    state.user = { id: "user-1", app_metadata: { role: "user" } };
    const { GET } = await import("../../src/app/api/admin/matching/settings/route");

    const response = await GET();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "forbidden",
      message: "אין לך הרשאת מנהל.",
    });
  });

  it("lists settings versions", async () => {
    const { GET } = await import("../../src/app/api/admin/matching/settings/route");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { versions: [{ id: "settings-v2", status: "published" }] },
    });
  });

  it("updates draft-only settings and writes audit", async () => {
    state.versions.push({
      id: "settings-draft-3",
      match_settings_id: "settings-1",
      version: 3,
      status: "draft",
      weights: { emotional_profile: 100 },
      hard_filters: [],
      deal_breaker_filters: [],
      published_at: null,
      created_at: "2026-06-06T11:00:00.000Z",
    });
    const { PUT } = await import("../../src/app/api/admin/matching/settings/[versionId]/route");

    const response = await PUT(
      jsonRequest("http://localhost/api/admin/matching/settings/settings-draft-3", "PUT", {
        weights: { emotional_profile: 70, communication_style: 30 },
        hardFilters: ["gender", "deal_breakers"],
        dealBreakerFilters: ["smoking"],
      }),
      { params: Promise.resolve({ versionId: "settings-draft-3" }) },
    );

    expect(response.status).toBe(200);
    expect(state.versions.find((version) => version.id === "settings-draft-3")).toMatchObject({
      weights: { emotional_profile: 70, communication_style: 30 },
      hard_filters: ["gender", "deal_breakers"],
      deal_breaker_filters: ["smoking"],
    });
    expect(state.auditLogs).toContainEqual(expect.objectContaining({ action: "matching.settings.update_draft" }));

    const publishedEdit = await PUT(
      jsonRequest("http://localhost/api/admin/matching/settings/settings-v2", "PUT", {
        weights: { emotional_profile: 100 },
        hardFilters: [],
        dealBreakerFilters: [],
      }),
      { params: Promise.resolve({ versionId: "settings-v2" }) },
    );
    expect(publishedEdit.status).toBe(409);
    await expect(publishedEdit.json()).resolves.toMatchObject({ ok: false, code: "version_not_editable" });
  });

  it("reruns matches for one user", async () => {
    const { POST } = await import("../../src/app/api/admin/matching/rerun/route");

    const response = await POST(
      jsonRequest("http://localhost/api/admin/matching/rerun", "POST", { scope: "user", userId: "user-a" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { recalculated: 1, settingsVersionId: "settings-v2" },
    });
    expect(state.auditLogs).toContainEqual(expect.objectContaining({ action: "matching.rerun_user" }));
  });
});

function profile(userId: string) {
  return {
    userId,
    traits: {
      emotional_profile: 100,
      communication_style: 100,
      commitment_readiness: 100,
      relationship_vision: 100,
    },
  };
}
