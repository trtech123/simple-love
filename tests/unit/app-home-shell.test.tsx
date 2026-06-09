import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppHomeShell } from "../../src/app/app/app-home-shell";
import type { MatchesPageData } from "../../src/app/matches/matches-loader";

vi.stubGlobal("React", React);

vi.mock("../../src/app/app/ai-coach-panel", () => ({
  AiCoachPanel: () => <div>גוף מאמנת</div>,
}));

vi.mock("../../src/app/matches/matching-unlock-button", () => ({
  MatchingUnlockButton: () => <button type="button">פתיחת התאמות</button>,
}));

vi.mock("../../src/app/matches/match-chat-button", () => ({
  MatchChatButton: ({ matchId }: { matchId: string }) => <button type="button">שיחה {matchId}</button>,
}));

describe("AppHomeShell", () => {
  afterEach(() => {
    cleanup();
  });

  it("switches between coach and profile tabs", () => {
    render(<AppHomeShell data={baseData()} />);

    expect(screen.getByText("גוף מאמנת")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "פרופיל" }));

    expect(screen.getByText("משתמש/ת נוכחי/ת")).toBeTruthy();
    expect(screen.getByText("תל אביב")).toBeTruthy();
    expect(screen.getByText("קשר רציני")).toBeTruthy();
    expect(screen.queryByText("גוף מאמנת")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "מאמנת" }));

    expect(screen.getByText("גוף מאמנת")).toBeTruthy();
  });

  it("shows the existing locked questionnaire and payment state in matches", () => {
    render(
      <AppHomeShell
        data={baseData({
          completedDepthQuestionnaireAt: "2026-06-08T00:00:00.000Z",
          hasMatchingEntitlement: false,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "התאמות" }));

    expect(screen.getByText(/פתיחת התאמות/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "ההתאמות מוכנות" })).toBeTruthy();
  });
});

function baseData(overrides: Partial<NonNullable<MatchesPageData["profile"]>> = {}): MatchesPageData {
  return {
    profile: {
      userId: "user-1",
      displayName: "משתמש/ת נוכחי/ת",
      relationshipIntention: "קשר רציני",
      locationText: "תל אביב",
      completedDepthQuestionnaireAt: null,
      matchingProfileComplete: true,
      hasMatchingEntitlement: false,
      ...overrides,
    },
    matches: [],
  };
}
