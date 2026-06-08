import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadMatchesPageData } from "../../src/app/matches/matches-loader";
import { resetE2eChatFixture } from "../../src/testing/e2e-chat-fixture";

const state = vi.hoisted(() => ({
  queriedTables: [] as string[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: () => createFakeSupabase(),
}));

describe("loadMatchesPageData", () => {
  beforeEach(() => {
    resetE2eChatFixture();
    state.queriedTables = [];
  });

  it("uses fixture data in e2e mode", async () => {
    const data = await loadMatchesPageData("user-a", { e2eMode: true });

    expect(data.profile?.displayName).toBe("User A");
    expect(data.matches).toEqual([
      expect.objectContaining({
        id: "match-1",
        score: 93,
        explanationSummary: expect.any(String),
        explanationReasons: expect.arrayContaining([expect.any(String)]),
        otherProfile: expect.objectContaining({ displayName: "User B" }),
      }),
    ]);
  });

  it("does not load real match data before matching entitlement exists", async () => {
    const data = await loadMatchesPageData("user-unpaid");

    expect(data.profile).toEqual(
      expect.objectContaining({
        userId: "user-unpaid",
        completedDepthQuestionnaireAt: "2026-06-08T00:00:00.000Z",
        matchingProfileComplete: true,
        hasMatchingEntitlement: false,
      }),
    );
    expect(data.matches).toEqual([]);
    expect(state.queriedTables).not.toContain("matches");
  });
});

function createFakeSupabase() {
  return {
    from(table: string) {
      state.queriedTables.push(table);

      if (table === "profiles") {
        return createProfilesTable();
      }

      if (table === "profile_deal_breakers") {
        return createDealBreakersTable();
      }

      if (table === "matching_entitlements") {
        return createEntitlementsTable();
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

function createProfilesTable() {
  return {
    select() {
      return {
        eq() {
          return {
            maybeSingle: async () => ({
              data: {
                user_id: "user-unpaid",
                display_name: "Sensitive Real Name",
                birth_year: 1992,
                preferred_age_min: 29,
                preferred_age_max: 40,
                preferred_distance_km: 30,
                gender: "woman",
                interested_in: "man",
                relationship_intention: "long_term",
                location_text: "Tel Aviv",
                completed_depth_questionnaire_at: "2026-06-08T00:00:00.000Z",
              },
              error: null,
            }),
          };
        },
      };
    },
  };
}

function createDealBreakersTable() {
  return {
    select() {
      return {
        eq() {
          return {
            returns: async () => ({ data: [{ normalized_key: "smoking" }], error: null }),
          };
        },
      };
    },
  };
}

function createEntitlementsTable() {
  return {
    select() {
      return {
        eq() {
          return {
            maybeSingle: async () => ({ data: null, error: null }),
          };
        },
      };
    },
  };
}
