import React from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  matchingProfileComplete: true,
  completedDepthQuestionnaireAt: null as string | null,
}));

vi.stubGlobal("React", React);

vi.mock("@/app/api/matching/auth", () => ({
  requireAuthenticatedUserId: async () => state.userId,
}));

vi.mock("@/lib/e2e-mode", () => ({
  isE2eTestMode: () => false,
}));

vi.mock("../../src/app/profile/matching/matching-profile-form", () => ({
  MatchingProfileForm: () => <div className="profile-onboarding">Onboarding wizard</div>,
}));

vi.mock("../../src/app/matches/matches-loader", () => ({
  loadMatchesPageData: async () => ({
    profile: {
      userId: "user-1",
      displayName: "Current User",
      relationshipIntention: "serious",
      locationText: "Tel Aviv",
      completedDepthQuestionnaireAt: state.completedDepthQuestionnaireAt,
      matchingProfileComplete: state.matchingProfileComplete,
      hasMatchingEntitlement: false,
    },
    matches: [],
  }),
}));

describe("/app page", () => {
  beforeEach(() => {
    vi.resetModules();
    state.userId = "user-1";
    state.matchingProfileComplete = true;
    state.completedDepthQuestionnaireAt = null;
  });

  it("shows onboarding only when profile details are incomplete", async () => {
    state.matchingProfileComplete = false;
    const AppPage = (await import("../../src/app/app/page")).default;

    const html = renderToString(await AppPage());

    expect(html).toContain("profile-onboarding");
    expect(html).not.toContain("app-tab-nav");
  });

  it("renders three tabs after profile completion without requiring the depth quiz", async () => {
    const AppPage = (await import("../../src/app/app/page")).default;

    const html = renderToString(await AppPage());

    expect(html).toContain("app-tab-nav");
    expect(html).toContain("הפרופיל שלי");
    expect(html).toContain("מאמנת AI");
    expect(html).toContain("התאמות");
    expect(html).toContain("שאלון העומק");
  });
});
