import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userId: "user-1" as string | null,
}));

vi.stubGlobal("React", React);

vi.mock("@/app/api/matching/auth", () => ({
  requireAuthenticatedUserId: async () => state.userId,
}));

vi.mock("@/lib/e2e-mode", () => ({
  isE2eTestMode: () => false,
}));

vi.mock("../../src/app/matches/matches-loader", () => ({
  loadMatchesPageData: async () => ({
    profile: {
      userId: "user-1",
      displayName: "משתמש/ת נוכחי/ת",
      relationshipIntention: "קשר ארוך טווח",
      locationText: "תל אביב",
      completedDepthQuestionnaireAt: "2026-06-08T00:00:00.000Z",
      matchingProfileComplete: true,
      hasMatchingEntitlement: false,
    },
    matches: [
      {
        id: "match-1",
        userA: "user-1",
        userB: "user-2",
        score: 98,
        explanationSummary: "Sensitive explanation",
        explanationReasons: ["Sensitive reason"],
        otherProfile: {
          userId: "user-2",
          displayName: "Sensitive Match Name",
          relationshipIntention: "long_term",
          locationText: "Jerusalem",
          completedDepthQuestionnaireAt: "2026-06-08T00:00:00.000Z",
          matchingProfileComplete: true,
          hasMatchingEntitlement: true,
        },
      },
    ],
  }),
}));

vi.mock("../../src/app/matches/matching-unlock-button", () => ({
  MatchingUnlockButton: () => <button type="button">פתיחת התאמות - 99 ש"ח</button>,
}));

describe("MatchesPage", () => {
  beforeEach(() => {
    vi.resetModules();
    state.userId = "user-1";
  });

  it("renders generic locked previews before payment without real match details", async () => {
    const MatchesPage = (await import("../../src/app/matches/page")).default;

    const html = renderToString(await MatchesPage());

    expect(html).toContain("app-home-shell");
    expect(html).toContain("התאמה נעולה");
    expect(html).toContain("פתיחת התאמות - 99");
    expect(html).not.toContain("Sensitive Match Name");
    expect(html).not.toContain("Sensitive explanation");
    expect(html).not.toContain("Jerusalem");
  });

  it("keeps the locked matches paywall wide enough for the preview grid", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toMatch(/\.matches-panel--locked\s*\{[^}]*width:\s*min\(100%,\s*980px\)/s);
  });
});
