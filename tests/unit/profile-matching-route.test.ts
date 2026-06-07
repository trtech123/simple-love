import { beforeEach, describe, expect, it, vi } from "vitest";

type TableName = "profiles" | "profile_deal_breakers";

const geocodeLocationTextMock = vi.hoisted(() => vi.fn());

const state = {
  userId: "user-1" as string | null,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  rpcError: null as { message: string } | null,
  profileSelectError: null as { message: string } | null,
  dealBreakersSelectError: null as { message: string } | null,
  profile: {
    user_id: "user-1",
    display_name: "User One",
    birth_year: 1994,
    preferred_age_min: 28,
    preferred_age_max: 38,
    gender: "woman",
    interested_in: "man",
    location_text: "Tel Aviv",
    location_latitude: 32.0853,
    location_longitude: 34.7818,
    location_geocoded_at: "2026-06-02T10:00:00.000Z",
    preferred_distance_km: 50,
    relationship_intention: "serious",
  },
  dealBreakers: [{ label: "Smoking", normalized_key: "smoking", other_text: null }],
};

vi.mock("@/app/api/matching/auth", () => ({
  requireAuthenticatedUserId: async () => state.userId,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: () => createFakeSupabase(),
}));

vi.mock("@/domain/matching/geocoding", () => ({
  geocodeLocationText: geocodeLocationTextMock,
}));

function createFakeSupabase() {
  return {
    rpc(fn: string, args: Record<string, unknown>) {
      state.rpcCalls.push({ fn, args });
      return { error: state.rpcError };
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
    order() {
      return builder;
    },
    async maybeSingle() {
      if (table === "profiles" && state.profileSelectError) {
        return { data: null, error: state.profileSelectError };
      }

      if (table === "profiles" && filters.user_id === state.userId) {
        return { data: state.profile, error: null };
      }

      return { data: null, error: null };
    },
    async returns() {
      if (table === "profile_deal_breakers") {
        return { data: state.dealBreakers, error: state.dealBreakersSelectError };
      }

      return { data: [], error: null };
    },
  };

  return builder;
}

function putRequest(body: unknown) {
  return new Request("http://localhost/api/profile/matching", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

const validProfileInput = {
  birthYear: 1992,
  preferredAgeMin: 30,
  preferredAgeMax: 42,
  gender: "man",
  interestedIn: "woman",
  locationText: "Haifa",
  preferredDistanceKm: 75,
  relationshipIntention: "serious",
  dealBreakers: ["Smoking", "pets_mismatch"],
};

describe("/api/profile/matching", () => {
  beforeEach(() => {
    vi.resetModules();
    state.userId = "user-1";
    state.rpcCalls = [];
    state.rpcError = null;
    state.profileSelectError = null;
    state.dealBreakersSelectError = null;
    geocodeLocationTextMock.mockReset();
  });

  it("returns profile completion state and current values in a success envelope", async () => {
    const { GET } = await import("../../src/app/api/profile/matching/route");

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      data: {
        complete: true,
        profile: {
          birthYear: 1994,
          preferredAgeMin: 28,
          preferredAgeMax: 38,
          gender: "woman",
          interestedIn: "man",
          locationText: "Tel Aviv",
          preferredDistanceKm: 50,
          relationshipIntention: "serious",
        },
        dealBreakers: [{ label: "Smoking", normalizedKey: "smoking" }],
      },
    });
  });

  it("returns an authentication-required envelope for anonymous users", async () => {
    state.userId = null;
    const { GET } = await import("../../src/app/api/profile/matching/route");

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "authentication_required",
      message: "צריך להתחבר כדי להמשיך.",
    });
  });

  it("returns schema-unavailable when matching profile columns are missing", async () => {
    state.profileSelectError = { message: "column profiles.preferred_age_min does not exist" };
    const { GET } = await import("../../src/app/api/profile/matching/route");

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "matching_schema_missing",
      message: "צריך להשלים את עדכון מסד הנתונים לפני שאפשר לשמור פרופיל התאמות.",
      details: {
        migration: "supabase/migrations/202606020002_matching_profile_preferences.sql",
      },
    });
  });

  it("saves profile preferences and deal breakers through one atomic RPC", async () => {
    geocodeLocationTextMock.mockResolvedValue({ latitude: 32.794, longitude: 34.9896 });
    const { PUT } = await import("../../src/app/api/profile/matching/route");

    const response = await PUT(putRequest(validProfileInput));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, data: { complete: true } });
    expect(state.rpcCalls).toEqual([
      {
        fn: "save_matching_profile",
        args: expect.objectContaining({
          p_user_id: "user-1",
          p_birth_year: 1992,
          p_preferred_age_min: 30,
          p_preferred_age_max: 42,
          p_gender: "man",
          p_interested_in: "woman",
          p_location_text: "Haifa",
          p_location_latitude: 32.794,
          p_location_longitude: 34.9896,
          p_location_geocoded_at: expect.any(String),
          p_preferred_distance_km: 75,
          p_relationship_intention: "serious",
          p_deal_breakers: [
            expect.objectContaining({ key: "smoking", otherText: null }),
            expect.objectContaining({ key: "pets_mismatch", otherText: null }),
          ],
        }),
      },
    ]);
    expect(geocodeLocationTextMock).toHaveBeenCalledWith("Haifa");
  });

  it("uses selected location coordinates without save-time geocoding", async () => {
    const { PUT } = await import("../../src/app/api/profile/matching/route");

    const response = await PUT(
      putRequest({
        ...validProfileInput,
        locationCoordinates: { latitude: 32.794, longitude: 34.9896 },
        dealBreakers: ["smoking"],
      }),
    );

    expect(response.status).toBe(200);
    expect(geocodeLocationTextMock).not.toHaveBeenCalled();
    expect(state.rpcCalls[0].args).toEqual(
      expect.objectContaining({
        p_location_text: "Haifa",
        p_location_latitude: 32.794,
        p_location_longitude: 34.9896,
      }),
    );
  });

  it("reuses cached coordinates when location text is unchanged", async () => {
    const { PUT } = await import("../../src/app/api/profile/matching/route");

    const response = await PUT(
      putRequest({
        birthYear: 1994,
        preferredAgeMin: 28,
        preferredAgeMax: 38,
        gender: "woman",
        interestedIn: "man",
        locationText: " Tel Aviv ",
        preferredDistanceKm: 30,
        relationshipIntention: "serious",
        dealBreakers: ["Smoking"],
      }),
    );

    expect(response.status).toBe(200);
    expect(geocodeLocationTextMock).not.toHaveBeenCalled();
    expect(state.rpcCalls[0]).toEqual({
      fn: "save_matching_profile",
      args: expect.objectContaining({
        p_location_text: "Tel Aviv",
        p_location_latitude: 32.0853,
        p_location_longitude: 34.7818,
        p_location_geocoded_at: "2026-06-02T10:00:00.000Z",
        p_preferred_distance_km: 30,
      }),
    });
  });

  it("rejects failed geocoding before saving profile fields", async () => {
    geocodeLocationTextMock.mockResolvedValue(null);
    const { PUT } = await import("../../src/app/api/profile/matching/route");

    const response = await PUT(putRequest({ ...validProfileInput, locationText: "Nowhere" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "location_not_found",
      message: "לא הצלחנו למצוא את המיקום הזה. כדאי לבחור עיר קרובה או לבדוק את האיות.",
    });
    expect(state.rpcCalls).toEqual([]);
  });

  it("does not perform partial writes when the atomic profile RPC fails", async () => {
    geocodeLocationTextMock.mockResolvedValue({ latitude: 32.794, longitude: 34.9896 });
    state.rpcError = { message: "transaction rolled back" };
    const { PUT } = await import("../../src/app/api/profile/matching/route");

    const response = await PUT(putRequest({ ...validProfileInput, dealBreakers: ["smoking"] }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "matching_schema_missing",
      message: "שמירת פרופיל ההתאמות אינה זמינה כרגע. נסו שוב אחרי עדכון המערכת.",
    });
    expect(state.rpcCalls).toHaveLength(1);
  });

  it("rejects invalid input with validation codes", async () => {
    const { PUT } = await import("../../src/app/api/profile/matching/route");

    const response = await PUT(putRequest({ birthYear: 2020 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "profile_invalid",
      message: "יש פרטים חסרים או לא תקינים בפרופיל ההתאמות.",
      details: {
        errors: expect.arrayContaining(["gender_required", "deal_breakers_required"]),
      },
    });
    expect(state.rpcCalls).toEqual([]);
  });
});
