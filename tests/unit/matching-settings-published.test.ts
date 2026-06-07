import { describe, expect, it, vi } from "vitest";
import { parsePublishedMatchSettings } from "../../src/domain/matching/settings";
import { loadPublishedMatchSettings } from "../../src/domain/matching/settings-repository";

describe("published match settings", () => {
  it("normalizes published settings with version id", () => {
    expect(
      parsePublishedMatchSettings({
        id: "settings-v2",
        weights: {
          emotional_profile: 50,
          communication_style: 30,
          commitment_readiness: 10,
          relationship_vision: 10,
          visual_taste: 0,
        },
        hard_filters: ["gender", "age_range", "distance", "relationship_intention", "deal_breakers"],
        deal_breaker_filters: ["smoking", "substance_use"],
      }),
    ).toEqual({
      ok: true,
      value: {
        versionId: "settings-v2",
        weights: {
          emotional_profile: 50,
          communication_style: 30,
          commitment_readiness: 10,
          relationship_vision: 10,
          visual_taste: 0,
        },
        hardFilters: ["gender", "age_range", "distance", "relationship_intention", "deal_breakers"],
        dealBreakerFilters: ["smoking", "substance_use"],
      },
    });
  });

  it("rejects settings with no active weights", () => {
    expect(
      parsePublishedMatchSettings({
        id: "settings-v3",
        weights: {
          emotional_profile: 0,
          communication_style: 0,
          commitment_readiness: 0,
          relationship_vision: 0,
          visual_taste: 0,
        },
        hard_filters: [],
        deal_breaker_filters: [],
      }),
    ).toEqual({
      ok: false,
      errors: [{ code: "weights_required", message: "לפחות משקל התאמה אחד חייב להיות פעיל." }],
    });
  });

  it("rejects unknown hard filter and deal-breaker keys", () => {
    expect(
      parsePublishedMatchSettings({
        id: "settings-v4",
        weights: { emotional_profile: 100 },
        hard_filters: ["unknown"],
        deal_breaker_filters: ["unknown"],
      }),
    ).toEqual({
      ok: false,
      errors: [
        { code: "invalid_hard_filter", message: "הגדרת סינון קשיח אינה תקינה." },
        { code: "invalid_deal_breaker_filter", message: "הגדרת דיל-ברייקר אינה תקינה." },
      ],
    });
  });

  it("loads the published settings version", async () => {
    const maybeSingle = vi.fn(() =>
      Promise.resolve({
        data: {
          id: "settings-v2",
          weights: { emotional_profile: 100 },
          hard_filters: ["gender"],
          deal_breaker_filters: ["smoking"],
        },
        error: null,
      }),
    );
    const eq = vi.fn(() => ({ order: () => ({ limit: () => ({ maybeSingle }) }) }));
    const select = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ select })) };

    await expect(loadPublishedMatchSettings(supabase)).resolves.toMatchObject({
      versionId: "settings-v2",
      weights: { emotional_profile: 100, visual_taste: 0 },
      hardFilters: ["gender"],
      dealBreakerFilters: ["smoking"],
    });

    expect(supabase.from).toHaveBeenCalledWith("match_settings_versions");
    expect(select).toHaveBeenCalledWith("id, weights, hard_filters, deal_breaker_filters");
    expect(eq).toHaveBeenCalledWith("status", "published");
  });

  it("throws when no published settings exist", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    };

    await expect(loadPublishedMatchSettings(supabase)).rejects.toThrow("Published match settings are missing");
  });

  it("accepts visual taste as a known top-level weight", () => {
    expect(
      parsePublishedMatchSettings({
        id: "settings-visual",
        weights: {
          emotional_profile: 30,
          communication_style: 22,
          commitment_readiness: 17,
          relationship_vision: 16,
          visual_taste: 15,
        },
        hard_filters: [],
        deal_breaker_filters: [],
      }),
    ).toEqual({
      ok: true,
      value: {
        versionId: "settings-visual",
        weights: {
          emotional_profile: 30,
          communication_style: 22,
          commitment_readiness: 17,
          relationship_vision: 16,
          visual_taste: 15,
        },
        hardFilters: [],
        dealBreakerFilters: [],
      },
    });
  });
});
