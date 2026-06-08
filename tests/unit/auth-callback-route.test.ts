import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashClaimToken } from "../../src/domain/claims/claim-token";

type TableName = "registration_claim_tokens" | "reports" | "quiz_sessions" | "profiles";

const HOUR_MS = 60 * 60 * 1000;
const futureExpiry = () => new Date(Date.now() + 24 * HOUR_MS).toISOString();
const pastExpiry = () => new Date(Date.now() - HOUR_MS).toISOString();

const state = {
  exchangeError: null as { message: string } | null,
  user: {
    id: "user-1",
    email: "google@example.com",
    user_metadata: { full_name: "Google User" },
  } as { id: string; email?: string; user_metadata?: Record<string, unknown> } | null,
  existingProfile: null as { user_id: string; display_name: string } | null,
  operations: [] as Array<{ table: TableName; type: "insert" | "update"; payload: unknown }>,
  claim: {
    id: "claim-1",
    quiz_session_id: "session-1",
    report_id: "report-1",
    token_hash: hashClaimToken("valid-claim-token"),
    expires_at: futureExpiry(),
    claimed_at: null as string | null,
    claimed_by: null as string | null,
  },
  reportStatus: "completed",
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      async exchangeCodeForSession() {
        return { data: {}, error: state.exchangeError };
      },
      async getUser() {
        return { data: { user: state.user }, error: null };
      },
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: () => createFakeSupabase(),
}));

function createFakeSupabase() {
  return {
    from(table: TableName) {
      return createTableBuilder(table);
    },
  };
}

function createTableBuilder(table: TableName) {
  const filters: Record<string, unknown> = {};

  const builder = {
    select() {
      return builder;
    },
    eq(column: string, value: unknown) {
      filters[column] = value;
      return builder;
    },
    is(column: string, value: unknown) {
      filters[column] = value;
      return builder;
    },
    insert(payload: unknown) {
      state.operations.push({ table, type: "insert", payload });
      return {
        async select() {
          return { single: async () => ({ data: payload, error: null }) };
        },
        async single() {
          return { data: payload, error: null };
        },
      };
    },
    update(payload: unknown) {
      state.operations.push({ table, type: "update", payload });
      return {
        eq(column: string, value: unknown) {
          filters[column] = value;
          return this;
        },
        is(column: string, value: unknown) {
          filters[column] = value;
          return this;
        },
        async select() {
          return { data: [payload], error: null };
        },
      };
    },
    async maybeSingle() {
      if (table === "registration_claim_tokens" && filters.token_hash === state.claim.token_hash) {
        return { data: state.claim, error: null };
      }

      if (table === "reports" && filters.id === "report-1") {
        return { data: { id: "report-1", status: state.reportStatus }, error: null };
      }

      if (table === "profiles" && filters.user_id === state.user?.id) {
        return { data: state.existingProfile, error: null };
      }

      return { data: null, error: null };
    },
  };

  return builder;
}

function callbackRequest(query: string) {
  return new Request(`http://localhost/auth/callback${query}`);
}

function redirectPath(response: Response) {
  const location = response.headers.get("location");
  expect(location).toBeTruthy();
  return new URL(location!).pathname + new URL(location!).search;
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.resetModules();
    state.exchangeError = null;
    state.user = {
      id: "user-1",
      email: "google@example.com",
      user_metadata: { full_name: "Google User" },
    };
    state.existingProfile = null;
    state.operations = [];
    state.claim = {
      id: "claim-1",
      quiz_session_id: "session-1",
      report_id: "report-1",
      token_hash: hashClaimToken("valid-claim-token"),
      expires_at: futureExpiry(),
      claimed_at: null,
      claimed_by: null,
    };
    state.reportStatus = "completed";
  });

  it("exchanges the OAuth code, creates a missing profile, claims the report, and redirects to matching", async () => {
    const { GET } = await import("../../src/app/auth/callback/route");

    const response = await GET(callbackRequest("?code=oauth-code&claim=valid-claim-token&next=/profile/matching"));

    expect(redirectPath(response)).toBe("/profile/matching");
    expect(state.operations).toEqual([
      {
        table: "profiles",
        type: "insert",
        payload: expect.objectContaining({ user_id: "user-1", display_name: "Google User" }),
      },
      { table: "reports", type: "update", payload: expect.objectContaining({ user_id: "user-1" }) },
      { table: "quiz_sessions", type: "update", payload: expect.objectContaining({ user_id: "user-1" }) },
      {
        table: "registration_claim_tokens",
        type: "update",
        payload: expect.objectContaining({ claimed_by: "user-1" }),
      },
    ]);
  });

  it("redirects missing codes back to register with a localized error key", async () => {
    const { GET } = await import("../../src/app/auth/callback/route");

    const response = await GET(callbackRequest("?claim=valid-claim-token"));

    expect(redirectPath(response)).toBe("/register?claim=valid-claim-token&error=missing_code");
    expect(state.operations).toEqual([]);
  });

  it("redirects invalid claims back to register", async () => {
    const { GET } = await import("../../src/app/auth/callback/route");

    const response = await GET(callbackRequest("?code=oauth-code&claim=missing-claim-token"));

    expect(redirectPath(response)).toBe("/register?claim=missing-claim-token&error=invalid_claim");
    expect(state.operations).toEqual([]);
  });

  it("redirects expired claims back to register", async () => {
    const { GET } = await import("../../src/app/auth/callback/route");
    state.claim.expires_at = pastExpiry();

    const response = await GET(callbackRequest("?code=oauth-code&claim=valid-claim-token"));

    expect(redirectPath(response)).toBe("/register?claim=valid-claim-token&error=expired_claim");
    expect(state.operations).toEqual([]);
  });

  it("treats duplicate callbacks for the same user as success", async () => {
    const { GET } = await import("../../src/app/auth/callback/route");
    state.existingProfile = { user_id: "user-1", display_name: "Existing Name" };
    state.claim.claimed_at = new Date().toISOString();
    state.claim.claimed_by = "user-1";

    const response = await GET(callbackRequest("?code=oauth-code&claim=valid-claim-token"));

    expect(redirectPath(response)).toBe("/app");
    expect(state.operations).toEqual([]);
  });

  it("redirects claims owned by another user back to register", async () => {
    const { GET } = await import("../../src/app/auth/callback/route");
    state.claim.claimed_at = new Date().toISOString();
    state.claim.claimed_by = "other-user";

    const response = await GET(callbackRequest("?code=oauth-code&claim=valid-claim-token"));

    expect(redirectPath(response)).toBe("/register?claim=valid-claim-token&error=already_claimed");
  });

  it("exchanges a no-claim OAuth code, ensures a profile, and redirects to app by default", async () => {
    const { GET } = await import("../../src/app/auth/callback/route");

    const response = await GET(callbackRequest("?code=oauth-code"));

    expect(redirectPath(response)).toBe("/app");
    expect(state.operations).toEqual([
      {
        table: "profiles",
        type: "insert",
        payload: expect.objectContaining({ user_id: "user-1", display_name: "Google User" }),
      },
    ]);
  });

  it("uses safe next paths for no-claim OAuth callbacks", async () => {
    const { GET } = await import("../../src/app/auth/callback/route");

    const response = await GET(callbackRequest("?code=oauth-code&next=/chat/conversation-1"));

    expect(redirectPath(response)).toBe("/chat/conversation-1");
  });

  it("redirects unsafe no-claim next paths to app", async () => {
    const { GET } = await import("../../src/app/auth/callback/route");

    const response = await GET(callbackRequest("?code=oauth-code&next=https://evil.example/path"));

    expect(redirectPath(response)).toBe("/app");
  });

  it("redirects missing no-claim OAuth codes back to login", async () => {
    const { GET } = await import("../../src/app/auth/callback/route");

    const response = await GET(callbackRequest("?next=/chat/conversation-1"));

    expect(redirectPath(response)).toBe("/login?next=%2Fchat%2Fconversation-1&error=missing_code");
    expect(state.operations).toEqual([]);
  });
});
