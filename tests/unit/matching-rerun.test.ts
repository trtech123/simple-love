import { describe, expect, it, vi } from "vitest";
import { rerunMatchesForUser } from "../../src/domain/matching/rerun";
import type { MatchProfile } from "../../src/domain/matching/types";

describe("matching rerun", () => {
  it("upserts matches with the exact settings version and writes explanations", async () => {
    const upserted: Record<string, unknown>[] = [];
    const explanations: Record<string, unknown>[] = [];
    const supabase = {
      from: vi.fn((table: string) => ({
        upsert: vi.fn((rows: Record<string, unknown> | Record<string, unknown>[], options: { onConflict: string }) => {
          const payload = Array.isArray(rows) ? rows : [rows];
          if (table === "matches") {
            upserted.push(...payload.map((row, index) => ({ id: `match-${index + 1}`, ...row })));
            return { select: () => ({ single: () => Promise.resolve({ data: upserted.at(-1), error: null }) }) };
          }
          if (table === "match_explanations") {
            explanations.push(...payload);
          }
          return Promise.resolve({ error: null, options });
        }),
        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
    };

    const result = await rerunMatchesForUser({
      supabase,
      userId: "user-a",
      settings: {
        versionId: "settings-v2",
        weights: {
          emotional_profile: 100,
          communication_style: 0,
          commitment_readiness: 0,
          relationship_vision: 0,
          visual_taste: 0,
        },
        hardFilters: [],
        dealBreakerFilters: [],
      },
      profiles: [completeProfile("user-a", 80), completeProfile("user-b", 90)],
    });

    expect(result).toEqual({ recalculated: 1, settingsVersionId: "settings-v2" });
    expect(upserted).toEqual([
      expect.objectContaining({
        user_a: "user-a",
        user_b: "user-b",
        match_settings_version_id: "settings-v2",
        status: "active",
      }),
    ]);
    expect(explanations).toEqual([
      expect.objectContaining({
        match_id: "match-1",
        explanation: expect.objectContaining({ settingsVersionId: "settings-v2" }),
      }),
    ]);
  });
});

function completeProfile(userId: string, traitValue: number): MatchProfile {
  return {
    userId,
    traits: {
      emotional_profile: traitValue,
      communication_style: traitValue,
      commitment_readiness: traitValue,
      relationship_vision: traitValue,
    },
  };
}
