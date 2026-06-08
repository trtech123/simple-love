import { describe, expect, it } from "vitest";
import {
  calculateMatchScore,
  effectiveMatchingTraits,
  deriveMatchingTraits,
  generateMatchesForProfile,
  passesHardFilters,
} from "../../src/domain/matching/scoring";

describe("matching", () => {
  it("rejects users outside hard filters", () => {
    expect(
      passesHardFilters(
        { userId: "a", birthYear: 1990, interestedIn: "woman", gender: "man", relationshipIntention: "serious", blockedUserIds: [] },
        { userId: "b", birthYear: 1995, interestedIn: "man", gender: "woman", relationshipIntention: "casual", blockedUserIds: [] },
      ),
    ).toBe(false);
  });

  it("rejects reciprocal age range, deal breaker, blocked, and disabled incompatibilities", () => {
    const baseA = {
      userId: "a",
      birthYear: 1990,
      preferredAgeMin: 30,
      preferredAgeMax: 40,
      interestedIn: "woman",
      gender: "man",
      locationText: "Tel Aviv",
      locationLatitude: 32.0853,
      locationLongitude: 34.7818,
      preferredDistanceKm: 10,
      relationshipIntention: "serious",
      dealBreakerKeys: ["smoking"],
      blockedUserIds: [],
    };
    const baseB = {
      userId: "b",
      birthYear: 1992,
      preferredAgeMin: 30,
      preferredAgeMax: 40,
      interestedIn: "man",
      gender: "woman",
      locationText: " tel aviv ",
      locationLatitude: 32.0684,
      locationLongitude: 34.8248,
      preferredDistanceKm: 10,
      relationshipIntention: "serious",
      dealBreakerKeys: ["cats"],
      blockedUserIds: [],
    };

    expect(passesHardFilters(baseA, baseB)).toBe(true);
    expect(passesHardFilters(baseA, { ...baseB, birthYear: 2001 })).toBe(false);
    expect(passesHardFilters(baseA, { ...baseB, dealBreakerKeys: ["smoking"] })).toBe(false);
    expect(passesHardFilters({ ...baseA, dealBreakerKeys: ["other"] }, { ...baseB, dealBreakerKeys: ["other"] })).toBe(true);
    expect(passesHardFilters(baseA, { ...baseB, blockedUserIds: ["a"] })).toBe(false);
    expect(passesHardFilters(baseA, { ...baseB, disabled: true })).toBe(false);
  });

  it("allows different city text when coordinates are within both users' preferred radius", () => {
    expect(
      passesHardFilters(
        {
          userId: "a",
          locationText: "Tel Aviv",
          locationLatitude: 32.0853,
          locationLongitude: 34.7818,
          preferredDistanceKm: 10,
        },
        {
          userId: "b",
          locationText: "Ramat Gan",
          locationLatitude: 32.0684,
          locationLongitude: 34.8248,
          preferredDistanceKm: 10,
        },
      ),
    ).toBe(true);
  });

  it("rejects candidates outside either user's preferred radius", () => {
    const current = {
      userId: "a",
      locationText: "Tel Aviv",
      locationLatitude: 32.0853,
      locationLongitude: 34.7818,
      preferredDistanceKm: 20,
    };
    const candidate = {
      userId: "b",
      locationText: "Jerusalem",
      locationLatitude: 31.7683,
      locationLongitude: 35.2137,
      preferredDistanceKm: 100,
    };

    expect(passesHardFilters(current, candidate)).toBe(false);
    expect(passesHardFilters({ ...current, preferredDistanceKm: 100 }, { ...candidate, preferredDistanceKm: 20 })).toBe(false);
  });

  it("calculates a hybrid score from weighted traits and logistics", () => {
    const score = calculateMatchScore({
      a: {
        userId: "a",
        birthYear: 1990,
        preferredAgeMin: 30,
        preferredAgeMax: 40,
        locationText: "Tel Aviv",
        locationLatitude: 32.0853,
        locationLongitude: 34.7818,
        preferredDistanceKm: 100,
        traits: {
          emotional_profile: 90,
          communication_style: 80,
          commitment_readiness: 50,
          relationship_vision: 60,
        },
      },
      b: {
        userId: "b",
        birthYear: 1992,
        preferredAgeMin: 30,
        preferredAgeMax: 40,
        locationText: "Ramat Gan",
        locationLatitude: 32.0684,
        locationLongitude: 34.8248,
        preferredDistanceKm: 100,
        traits: {
          emotional_profile: 80,
          communication_style: 60,
          commitment_readiness: 60,
          relationship_vision: 40,
        },
      },
      weights: {
        emotional_profile: 40,
        communication_style: 30,
        commitment_readiness: 20,
        relationship_vision: 10,
      },
    });

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBe(90);
  });

  it("rewards communication complementarity when users have an ideal trait gap", () => {
    const sameCommunication = calculateMatchScore({
      a: { userId: "a", traits: { communication_style: 80 } },
      b: { userId: "b", traits: { communication_style: 80 } },
      weights: { communication_style: 100 },
    });
    const complementaryCommunication = calculateMatchScore({
      a: { userId: "a", traits: { communication_style: 80 } },
      b: { userId: "b", traits: { communication_style: 60 } },
      weights: { communication_style: 100 },
    });

    expect(sameCommunication).toBe(95);
    expect(complementaryCommunication).toBe(89);
  });

  it("derives normalized v1 matching traits from selected option positions", () => {
    const traits = deriveMatchingTraits({
      questions: [
        { id: "q1", stableKey: "match_q01", questionType: "multiple_choice", options: [{ id: "a", position: 1 }, { id: "b", position: 4 }] },
        { id: "q2", stableKey: "match_q31", questionType: "multiple_choice", options: [{ id: "c", position: 1 }, { id: "d", position: 4 }] },
        { id: "q3", stableKey: "match_q66", questionType: "multiple_choice", options: [{ id: "e", position: 1 }, { id: "f", position: 4 }] },
        { id: "q4", stableKey: "match_q80", questionType: "multiple_choice", options: [{ id: "g", position: 1 }, { id: "h", position: 4 }] },
      ],
      answers: { q1: "b", q2: "c", q3: "f", q4: "g" },
    });

    expect(traits).toEqual({
      emotional_profile: 100,
      communication_style: 0,
      commitment_readiness: 100,
      relationship_vision: 0,
    });
  });

  it("derives normalized visual taste dimensions from scored A/B cards and ignores skips", () => {
    const traits = deriveMatchingTraits({
      questions: [
        {
          id: "visual-1",
          stableKey: "visual_taste_01",
          questionType: "multiple_choice",
          usageFlags: { matchingInput: true, visualTaste: true },
          options: [
            {
              id: "minimal",
              position: 1,
              score: { visual_taste: { minimal_expressive: -1, urban_nature: 1 } },
            },
            {
              id: "expressive",
              position: 2,
              score: { visual_taste: { minimal_expressive: 1, urban_nature: -1 } },
            },
            { id: "skip", position: 3, score: { visual_taste: { skip: true } } },
          ],
        },
        {
          id: "visual-2",
          stableKey: "visual_taste_02",
          questionType: "multiple_choice",
          usageFlags: { matchingInput: true, visualTaste: true },
          options: [
            { id: "cozy", position: 1, score: { visual_taste: { cozy_polished: -0.5 } } },
            { id: "polished", position: 2, score: { visual_taste: { cozy_polished: 0.5 } } },
            { id: "skip-2", position: 3, score: { visual_taste: { skip: true } } },
          ],
        },
      ],
      answers: {
        "visual-1": "expressive",
        "visual-2": "skip-2",
      },
    });

    expect(traits).toMatchObject({
      emotional_profile: 0,
      communication_style: 0,
      commitment_readiness: 0,
      relationship_vision: 0,
      visual_taste: 50,
      visual_taste_minimal_expressive: 100,
      visual_taste_urban_nature: 0,
    });
    expect(traits).not.toHaveProperty("visual_taste_cozy_polished");
  });

  it("does not add visual taste traits when no visual cards are answered", () => {
    const traits = deriveMatchingTraits({
      questions: [
        {
          id: "visual-1",
          stableKey: "visual_taste_01",
          questionType: "multiple_choice",
          usageFlags: { matchingInput: true, visualTaste: true },
          options: [
            { id: "minimal", position: 1, score: { visual_taste: { minimal_expressive: -1 } } },
            { id: "expressive", position: 2, score: { visual_taste: { minimal_expressive: 1 } } },
          ],
        },
      ],
      answers: {},
    });

    expect(traits).not.toHaveProperty("visual_taste");
    expect(traits).not.toHaveProperty("visual_taste_minimal_expressive");
  });

  it("generates symmetric active matches without duplicates after hard filters", () => {
    const matches = generateMatchesForProfile({
      profile: {
        userId: "user-b",
        gender: "woman",
        interestedIn: "man",
        relationshipIntention: "serious",
        blockedUserIds: [],
        traits: {
          emotional_profile: 80,
          communication_style: 70,
          commitment_readiness: 60,
          relationship_vision: 50,
        },
      },
      candidates: [
        {
          userId: "user-a",
          gender: "man",
          interestedIn: "woman",
          relationshipIntention: "serious",
          blockedUserIds: [],
          traits: {
            emotional_profile: 90,
            communication_style: 70,
            commitment_readiness: 50,
            relationship_vision: 40,
          },
        },
        {
          userId: "user-c",
          gender: "man",
          interestedIn: "woman",
          relationshipIntention: "casual",
          blockedUserIds: [],
          traits: {
            emotional_profile: 90,
            communication_style: 70,
            commitment_readiness: 50,
            relationship_vision: 40,
          },
        },
      ],
    });

    expect(matches).toEqual([
      {
        userA: "user-a",
        userB: "user-b",
        score: 93,
        matchSettingsVersionId: "default",
        explanation: {
          settingsVersionId: "default",
          summary: expect.any(String),
          traitScores: {
            emotional_profile: 90,
            communication_style: 94,
            commitment_readiness: 90,
            relationship_vision: 90,
          },
          logisticsScores: {
            reciprocalAgeFit: 100,
            distanceFit: 100,
            overall: 100,
          },
          breakdown: {
            trait: 91,
            logistics: 100,
            final: 93,
          },
          reasons: expect.arrayContaining([expect.any(String)]),
        },
      },
    ]);
  });

  it("stores scores using admin-published weights and settings metadata", () => {
    const matches = generateMatchesForProfile({
      profile: {
        userId: "user-a",
        traits: {
          emotional_profile: 100,
          communication_style: 0,
          commitment_readiness: 0,
          relationship_vision: 0,
        },
      },
      candidates: [
        {
          userId: "user-b",
          traits: {
            emotional_profile: 90,
            communication_style: 100,
            commitment_readiness: 100,
            relationship_vision: 100,
          },
        },
      ],
      settings: {
        versionId: "settings-v2",
        weights: {
          emotional_profile: 100,
          communication_style: 0,
          commitment_readiness: 0,
          relationship_vision: 0,
          visual_taste: 0,
        },
        hardFilters: ["gender", "age_range", "distance", "relationship_intention", "deal_breakers"],
        dealBreakerFilters: ["smoking"],
      },
    });

    expect(matches[0]).toMatchObject({
      matchSettingsVersionId: "settings-v2",
      explanation: {
        settingsVersionId: "settings-v2",
        traitScores: { emotional_profile: 90 },
      },
    });
    expect(matches[0].score).toBe(92);
  });

  it("uses visual taste vectors to rank close candidates higher without excluding large gaps", () => {
    const baseTraits = {
      emotional_profile: 80,
      communication_style: 80,
      commitment_readiness: 80,
      relationship_vision: 80,
    };

    const matches = generateMatchesForProfile({
      profile: {
        userId: "user-a",
        traits: {
          ...baseTraits,
          visual_taste: 60,
          visual_taste_minimal_expressive: 70,
          visual_taste_urban_nature: 65,
          visual_taste_cozy_polished: 60,
          visual_taste_spontaneous_curated: 55,
          visual_taste_quiet_social: 80,
        },
      },
      candidates: [
        {
          userId: "close-visual",
          traits: {
            ...baseTraits,
            visual_taste: 62,
            visual_taste_minimal_expressive: 72,
            visual_taste_urban_nature: 63,
            visual_taste_cozy_polished: 58,
            visual_taste_spontaneous_curated: 57,
            visual_taste_quiet_social: 76,
          },
        },
        {
          userId: "far-visual",
          traits: {
            ...baseTraits,
            visual_taste: 30,
            visual_taste_minimal_expressive: 10,
            visual_taste_urban_nature: 10,
            visual_taste_cozy_polished: 15,
            visual_taste_spontaneous_curated: 20,
            visual_taste_quiet_social: 5,
          },
        },
      ],
      settings: {
        versionId: "settings-visual",
        weights: {
          emotional_profile: 0,
          communication_style: 0,
          commitment_readiness: 0,
          relationship_vision: 0,
          visual_taste: 100,
        },
        hardFilters: [],
        dealBreakerFilters: [],
      },
    });

    expect(matches).toHaveLength(2);
    expect(matches.map((match) => otherUserId(match, "user-a"))).toEqual(["close-visual", "far-visual"]);
    expect(matches[0].score).toBeGreaterThan(matches[1].score);
    expect(matches[1].score).toBeGreaterThan(0);
  });

  it("preserves existing ranking when visual taste weight is zero", () => {
    const baseTraits = {
      emotional_profile: 80,
      communication_style: 80,
      commitment_readiness: 80,
      relationship_vision: 80,
    };
    const withoutVisual = calculateMatchScore({
      a: { userId: "a", traits: baseTraits },
      b: { userId: "b", traits: { ...baseTraits, emotional_profile: 70 } },
      weights: {
        emotional_profile: 100,
        communication_style: 0,
        commitment_readiness: 0,
        relationship_vision: 0,
      },
    });
    const withZeroVisual = calculateMatchScore({
      a: {
        userId: "a",
        traits: { ...baseTraits, visual_taste: 90, visual_taste_quiet_social: 100 },
      },
      b: {
        userId: "b",
        traits: { ...baseTraits, emotional_profile: 70, visual_taste: 10, visual_taste_quiet_social: 0 },
      },
      weights: {
        emotional_profile: 100,
        communication_style: 0,
        commitment_readiness: 0,
        relationship_vision: 0,
        visual_taste: 0,
      },
    });

    expect(withZeroVisual).toBe(withoutVisual);
  });

  it("uses capped AI soft-signal deltas without mutating hard filters", () => {
    expect(
      effectiveMatchingTraits(
        { emotional_profile: 90, communication_style: 5 },
        [
          { traitKey: "emotional_profile", delta: 40 },
          { traitKey: "emotional_profile", delta: -5 },
          { traitKey: "communication_style", delta: -50 },
          { traitKey: "unknown_trait", delta: 100 },
        ],
      ),
    ).toEqual({
      emotional_profile: 100,
      communication_style: 0,
    });
  });

  it("limits deal-breaker hard-filter overlap to configured keys", () => {
    const base = {
      traits: {
        emotional_profile: 100,
        communication_style: 100,
        commitment_readiness: 100,
        relationship_vision: 100,
      },
    };

    expect(
      generateMatchesForProfile({
        profile: { ...base, userId: "user-a", dealBreakerKeys: ["pets_mismatch"] },
        candidates: [{ ...base, userId: "user-b", dealBreakerKeys: ["pets_mismatch"] }],
        settings: {
          versionId: "settings-v2",
          weights: {
            emotional_profile: 100,
            communication_style: 0,
            commitment_readiness: 0,
            relationship_vision: 0,
            visual_taste: 0,
          },
          hardFilters: ["deal_breakers"],
          dealBreakerFilters: ["smoking"],
        },
      }),
    ).toHaveLength(1);

    expect(
      generateMatchesForProfile({
        profile: { ...base, userId: "user-a", dealBreakerKeys: ["smoking"] },
        candidates: [{ ...base, userId: "user-b", dealBreakerKeys: ["smoking"] }],
        settings: {
          versionId: "settings-v2",
          weights: {
            emotional_profile: 100,
            communication_style: 0,
            commitment_readiness: 0,
            relationship_vision: 0,
            visual_taste: 0,
          },
          hardFilters: ["deal_breakers"],
          dealBreakerFilters: ["smoking"],
        },
      }),
    ).toHaveLength(0);
  });

  it("includes reciprocal distance fit in the final score", () => {
    const matches = generateMatchesForProfile({
      profile: {
        userId: "user-a",
        locationText: "Tel Aviv",
        locationLatitude: 32.0853,
        locationLongitude: 34.7818,
        preferredDistanceKm: 500,
        traits: {
          emotional_profile: 70,
          communication_style: 80,
          commitment_readiness: 60,
          relationship_vision: 90,
        },
      },
      candidates: [
        {
          userId: "near",
          locationText: "Ramat Gan",
          locationLatitude: 32.0684,
          locationLongitude: 34.8248,
          preferredDistanceKm: 500,
          traits: {
            emotional_profile: 80,
            communication_style: 70,
            commitment_readiness: 60,
            relationship_vision: 80,
          },
        },
        {
          userId: "far",
          locationText: "Eilat",
          locationLatitude: 29.5577,
          locationLongitude: 34.9519,
          preferredDistanceKm: 500,
          traits: {
            emotional_profile: 80,
            communication_style: 70,
            commitment_readiness: 60,
            relationship_vision: 80,
          },
        },
      ],
    });

    expect(matches).toHaveLength(2);
    expect(matches.map((match) => match.score)).toEqual([94, 88]);
  });

});

function otherUserId(match: { userA: string; userB: string }, currentUserId: string) {
  return match.userA === currentUserId ? match.userB : match.userA;
}
