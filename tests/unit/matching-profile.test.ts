import { describe, expect, it } from "vitest";

import {
  isMatchingProfileComplete,
  validateMatchingProfileInput,
} from "../../src/domain/matching/profile";
import {
  canonicalizeDealBreakerKey,
  canonicalizeDealBreakerSubmission,
} from "../../src/domain/matching/deal-breakers";

const completeInput = {
  birthYear: 1994,
  preferredAgeMin: 28,
  preferredAgeMax: 38,
  gender: "woman",
  interestedIn: "man",
  locationText: "Tel Aviv",
  preferredDistanceKm: 25,
  relationshipIntention: "serious",
  dealBreakers: ["smoking"],
};

describe("matching profile", () => {
  it("canonicalizes supported deal breaker keys and legacy English labels", () => {
    expect(canonicalizeDealBreakerKey("  Smoking ")).toBe("smoking");
    expect(canonicalizeDealBreakerKey("pets_mismatch")).toBe("pets_mismatch");
    expect(canonicalizeDealBreakerKey("No kids")).toBeNull();
  });

  it("uses Hebrew labels for supported deal breakers", () => {
    expect(
      canonicalizeDealBreakerSubmission({
        dealBreakers: ["smoking", "pets_mismatch", "other"],
        otherDealBreakerText: "נסיעות ארוכות לעיתים קרובות",
      }),
    ).toEqual([
      { key: "smoking", label: "עישון", otherText: null },
      { key: "pets_mismatch", label: "חוסר התאמה בנושא בעלי חיים", otherText: null },
      { key: "other", label: "אחר", otherText: "נסיעות ארוכות לעיתים קרובות" },
    ]);
  });

  it("keeps other deal breaker text out of hard-filter keys", () => {
    expect(
      canonicalizeDealBreakerSubmission({
        dealBreakers: ["smoking", "other", "No kids"],
        otherDealBreakerText: "Frequent international travel",
      }),
    ).toEqual([
      { key: "smoking", label: "עישון", otherText: null },
      { key: "other", label: "אחר", otherText: "Frequent international travel" },
    ]);
  });

  it("accepts a complete required matching profile payload", () => {
    const result = validateMatchingProfileInput(completeInput);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        birthYear: 1994,
        preferredAgeMin: 28,
        preferredAgeMax: 38,
        gender: "woman",
        interestedIn: "man",
        locationText: "Tel Aviv",
        preferredDistanceKm: 25,
        relationshipIntention: "serious",
      });
      expect(result.value.dealBreakers).toEqual([{ key: "smoking", label: "עישון", otherText: null }]);
    }
  });

  it("defaults preferred distance to 50 km when omitted", () => {
    const { preferredDistanceKm: _preferredDistanceKm, ...inputWithoutRadius } = completeInput;
    const result = validateMatchingProfileInput(inputWithoutRadius);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.preferredDistanceKm).toBe(50);
    }
  });

  it("rejects impossible age ranges and missing deal breakers with stable codes", () => {
    expect(
      validateMatchingProfileInput({
        ...completeInput,
        preferredAgeMin: 45,
        preferredAgeMax: 30,
      }),
    ).toMatchObject({ ok: false, errors: ["preferred_age_range_invalid"] });

    expect(validateMatchingProfileInput({ ...completeInput, dealBreakers: [] })).toMatchObject({
      ok: false,
      errors: ["deal_breakers_required"],
    });
    expect(validateMatchingProfileInput({ ...completeInput, dealBreakers: ["free text"] })).toMatchObject({
      ok: false,
      errors: ["deal_breakers_required"],
    });
    expect(validateMatchingProfileInput({ ...completeInput, preferredDistanceKm: 0 })).toMatchObject({
      ok: false,
      errors: ["preferred_distance_invalid"],
    });
    expect(validateMatchingProfileInput({ ...completeInput, preferredDistanceKm: 501 })).toMatchObject({
      ok: false,
      errors: ["preferred_distance_invalid"],
    });
  });

  it("rejects invalid birth years by code", () => {
    expect(validateMatchingProfileInput({ ...completeInput, birthYear: 1899 })).toMatchObject({
      ok: false,
      errors: ["birth_year_invalid"],
    });
    expect(validateMatchingProfileInput({ ...completeInput, birthYear: 2020 })).toMatchObject({
      ok: false,
      errors: ["birth_year_invalid"],
    });
  });

  it("requires every matching field and at least one deal breaker for completion", () => {
    expect(isMatchingProfileComplete({ ...completeInput, dealBreakerKeys: ["smoking"] })).toBe(true);
    expect(isMatchingProfileComplete({ ...completeInput, locationText: "", dealBreakerKeys: ["smoking"] })).toBe(false);
    expect(isMatchingProfileComplete({ ...completeInput, dealBreakerKeys: [] })).toBe(false);
  });
});
