import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PROFILE_FORM_CONFIG } from "../../src/domain/matching/profile-form-config";

type Version = {
  id: string;
  profile_form_config_id: string;
  version: number;
  status: "draft" | "published" | "archived";
  config: unknown;
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
      id: "published-1",
      profile_form_config_id: "config-1",
      version: 1,
      status: "published",
      config: DEFAULT_PROFILE_FORM_CONFIG,
      published_at: "2026-06-06T10:00:00.000Z",
      created_at: "2026-06-06T09:00:00.000Z",
    },
  ] as Version[],
  auditLogs: [] as Record<string, unknown>[],
  nextDraftId: "draft-2",
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
  let orderColumn = "";
  let descending = false;
  let limitCount: number | null = null;

  const builder = {
    select() {
      return builder;
    },
    eq(column: string, value: unknown) {
      filters[column] = value;
      return builder;
    },
    order(column: string, options?: { ascending?: boolean }) {
      orderColumn = column;
      descending = options?.ascending === false;
      return builder;
    },
    limit(count: number) {
      limitCount = count;
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
      if (table === "profile_form_config_versions" && column === "id" && updatePayload) {
        state.versions = state.versions.map((version) =>
          values.includes(version.id) ? ({ ...version, ...updatePayload } as Version) : version,
        );
      }
      return builder;
    },
    async maybeSingle() {
      if (table === "profile_form_config_versions") {
        const version = state.versions.find((item) => item.id === filters.id) ?? null;
        return { data: version, error: null };
      }
      return { data: null, error: null };
    },
    async single() {
      if (table === "profile_form_config_versions" && insertPayload) {
        const source = insertPayload as Partial<Version>;
        const draft = {
          ...source,
          id: state.nextDraftId,
          created_at: "2026-06-06T11:00:00.000Z",
        } as Version;
        state.versions.push(draft);
        return { data: { id: draft.id }, error: null };
      }
      return { data: null, error: null };
    },
    async returns() {
      if (table === "profile_form_config_versions") {
        let rows = state.versions.filter((version) =>
          Object.entries(filters).every(([key, value]) => version[key as keyof Version] === value),
        );
        if (orderColumn) {
          rows = rows.sort((a, b) => {
            const left = a[orderColumn as keyof Version] as string | number;
            const right = b[orderColumn as keyof Version] as string | number;
            return descending ? (left < right ? 1 : -1) : left > right ? 1 : -1;
          });
        }
        if (limitCount !== null) {
          rows = rows.slice(0, limitCount);
        }
        return { data: rows, error: null };
      }
      return { data: [], error: null };
    },
    then(resolve: (value: { error: null }) => void) {
      if (table === "profile_form_config_versions" && updatePayload && filters.id) {
        state.versions = state.versions.map((version) =>
          version.id === filters.id ? ({ ...version, ...updatePayload } as Version) : version,
        );
      }
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

describe("/api/admin/profile-form-config", () => {
  beforeEach(() => {
    vi.resetModules();
    state.user = { id: "admin-1", app_metadata: { role: "admin" } };
    state.versions = [
      {
        id: "published-1",
        profile_form_config_id: "config-1",
        version: 1,
        status: "published",
        config: DEFAULT_PROFILE_FORM_CONFIG,
        published_at: "2026-06-06T10:00:00.000Z",
        created_at: "2026-06-06T09:00:00.000Z",
      },
    ];
    state.auditLogs = [];
  });

  it("rejects unauthenticated and non-admin requests", async () => {
    state.user = null;
    const { GET } = await import("../../src/app/api/admin/profile-form-config/route");

    let response = await GET();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "authentication_required" });

    state.user = { id: "user-1", app_metadata: { role: "user" } };
    response = await GET();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "forbidden" });
  });

  it("lists config versions for admins", async () => {
    const { GET } = await import("../../src/app/api/admin/profile-form-config/route");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        versions: [{ id: "published-1", version: 1, status: "published" }],
      },
    });
  });

  it("creates a draft from an existing version and writes audit", async () => {
    const { POST } = await import("../../src/app/api/admin/profile-form-config/route");

    const response = await POST(
      jsonRequest("http://localhost/api/admin/profile-form-config", "POST", {
        sourceVersionId: "published-1",
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { versionId: "draft-2" },
    });
    expect(state.versions).toContainEqual(
      expect.objectContaining({ id: "draft-2", version: 2, status: "draft", published_at: null }),
    );
    expect(state.auditLogs).toContainEqual(
      expect.objectContaining({
        action: "profile_form_config_versions.create_draft",
        target_id: "draft-2",
      }),
    );
  });

  it("updates only draft versions and validates config", async () => {
    state.versions.push({
      id: "draft-2",
      profile_form_config_id: "config-1",
      version: 2,
      status: "draft",
      config: DEFAULT_PROFILE_FORM_CONFIG,
      published_at: null,
      created_at: "2026-06-06T11:00:00.000Z",
    });
    const { PUT } = await import("../../src/app/api/admin/profile-form-config/[versionId]/route");

    const response = await PUT(
      jsonRequest("http://localhost/api/admin/profile-form-config/draft-2", "PUT", {
        config: {
          ...DEFAULT_PROFILE_FORM_CONFIG,
          preferredDistanceKm: { min: 1, max: 250, default: 30 },
        },
      }),
      { params: Promise.resolve({ versionId: "draft-2" }) },
    );

    expect(response.status).toBe(200);
    expect(state.versions.find((version) => version.id === "draft-2")?.config).toMatchObject({
      preferredDistanceKm: { min: 1, max: 250, default: 30 },
    });
    expect(state.auditLogs).toContainEqual(
      expect.objectContaining({ action: "profile_form_config_versions.save_draft" }),
    );

    const publishedEdit = await PUT(
      jsonRequest("http://localhost/api/admin/profile-form-config/published-1", "PUT", {
        config: DEFAULT_PROFILE_FORM_CONFIG,
      }),
      { params: Promise.resolve({ versionId: "published-1" }) },
    );
    expect(publishedEdit.status).toBe(409);
    await expect(publishedEdit.json()).resolves.toMatchObject({ ok: false, code: "version_not_editable" });
  });

  it("publishes a draft and archives published siblings", async () => {
    state.versions.push({
      id: "draft-2",
      profile_form_config_id: "config-1",
      version: 2,
      status: "draft",
      config: DEFAULT_PROFILE_FORM_CONFIG,
      published_at: null,
      created_at: "2026-06-06T11:00:00.000Z",
    });
    const { POST } = await import("../../src/app/api/admin/profile-form-config/[versionId]/publish/route");

    const response = await POST(
      jsonRequest("http://localhost/api/admin/profile-form-config/draft-2/publish", "POST"),
      { params: Promise.resolve({ versionId: "draft-2" }) },
    );

    expect(response.status).toBe(200);
    expect(state.versions.find((version) => version.id === "published-1")?.status).toBe("archived");
    expect(state.versions.find((version) => version.id === "draft-2")?.status).toBe("published");
    expect(state.auditLogs).toContainEqual(
      expect.objectContaining({ action: "profile_form_config_versions.publish" }),
    );
  });
});
