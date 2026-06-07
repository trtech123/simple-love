import { describe, expect, it } from "vitest";
import { normalizeWeights, validateMatchSettings } from "../../src/domain/admin/match-settings-admin";

describe("match settings admin rules", () => {
  it("normalizes active weights to 100", () => {
    expect(normalizeWeights({ emotional_profile: 3, communication_style: 1 })).toEqual({
      emotional_profile: 75,
      communication_style: 25,
    });
  });

  it("rejects settings without active weights", () => {
    expect(() => validateMatchSettings({ weights: {}, hardFilters: ["gender"], dealBreakerFilters: [] })).toThrow(
      "At least one active matching weight is required",
    );
  });

  it("accepts known hard filters and deal-breaker filters", () => {
    expect(
      validateMatchSettings({
        weights: { emotional_profile: 3, communication_style: 1, visual_taste: 1 },
        hardFilters: ["gender", "age_range", "distance", "relationship_intention", "deal_breakers"],
        dealBreakerFilters: ["smoking", "substance_use"],
      }),
    ).toEqual({
      weights: { emotional_profile: 60, communication_style: 20, visual_taste: 20 },
      hardFilters: ["gender", "age_range", "distance", "relationship_intention", "deal_breakers"],
      dealBreakerFilters: ["smoking", "substance_use"],
    });
  });

  it("rejects unknown hard filters and deal-breaker filters", () => {
    expect(() =>
      validateMatchSettings({
        weights: { emotional_profile: 1 },
        hardFilters: ["gender", "unknown"],
        dealBreakerFilters: ["unknown"],
      }),
    ).toThrow("Unknown matching hard filter");
  });
});
