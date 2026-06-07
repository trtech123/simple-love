import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashClaimToken } from "../../src/domain/claims/claim-token";

type TableName = "registration_claim_tokens" | "reports" | "quiz_sessions" | "profiles";

const HOUR_MS = 60 * 60 * 1000;
const futureExpiry = () => new Date(Date.now() + 24 * HOUR_MS).toISOString();
const pastExpiry = () => new Date(Date.now() - HOUR_MS).toISOString();

const state = {
  createUserError: null as { message: string } | null,
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

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: () => createFakeSupabase(),
}));

function createFakeSupabase() {
  return {
    auth: {
      admin: {
        async createUser() {
          if (state.createUserError) {
            return { data: { user: null }, error: state.createUserError };
          }

          return { data: { user: { id: "user-1" } }, error: null };
        },
      },
    },
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

      return { data: null, error: null };
    },
  };

  return builder;
}

function registerRequest(body: unknown) {
  return new Request("http://localhost/api/register/claim", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/register/claim", () => {
  beforeEach(() => {
    state.createUserError = null;
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

  it("creates the user profile and attaches the paid report", async () => {
    const { POST } = await import("../../src/app/api/register/claim/route");

    const response = await POST(
      registerRequest({
        claimToken: "valid-claim-token",
        email: "new@example.com",
        password: "password123",
        displayName: "New User",
      }),
    );

    await expect(response.json()).resolves.toEqual({ ok: true, userId: "user-1", reportId: "report-1" });
    expect(response.status).toBe(200);
    expect(state.operations).toEqual([
      {
        table: "profiles",
        type: "insert",
        payload: expect.objectContaining({ user_id: "user-1", display_name: "New User" }),
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

  it("returns 404 for an invalid claim token", async () => {
    const { POST } = await import("../../src/app/api/register/claim/route");

    const response = await POST(
      registerRequest({
        claimToken: "missing-claim-token",
        email: "new@example.com",
        password: "password123",
        displayName: "New User",
      }),
    );

    expect(response.status).toBe(404);
    expect(state.operations).toEqual([]);
  });

  it("returns 410 for an expired token", async () => {
    const { POST } = await import("../../src/app/api/register/claim/route");
    state.claim.expires_at = pastExpiry();

    const response = await POST(
      registerRequest({
        claimToken: "valid-claim-token",
        email: "new@example.com",
        password: "password123",
        displayName: "New User",
      }),
    );

    expect(response.status).toBe(410);
    expect(state.operations).toEqual([]);
  });

  it("returns 409 for duplicate email without claiming the token", async () => {
    const { POST } = await import("../../src/app/api/register/claim/route");
    state.createUserError = { message: "A user with this email address has already been registered" };

    const response = await POST(
      registerRequest({
        claimToken: "valid-claim-token",
        email: "existing@example.com",
        password: "password123",
        displayName: "Existing User",
      }),
    );

    expect(response.status).toBe(409);
    expect(state.operations).toEqual([]);
  });
});
