import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppHomeShell } from "../../src/app/app/app-home-shell";
import type { MatchesPageData } from "../../src/app/matches/matches-loader";

vi.stubGlobal("React", React);

vi.mock("../../src/app/app/ai-coach-panel", () => ({
  AiCoachPanel: () => <div>Coach panel body</div>,
}));

vi.mock("../../src/app/matches/matching-unlock-button", () => ({
  MatchingUnlockButton: () => <button type="button">Unlock matching</button>,
}));

vi.mock("../../src/app/matches/match-chat-button", () => ({
  MatchChatButton: ({ matchId }: { matchId: string }) => <button type="button">Chat {matchId}</button>,
}));

describe("AppHomeShell", () => {
  afterEach(() => {
    cleanup();
  });

  it("switches between coach and profile tabs", () => {
    render(<AppHomeShell data={baseData()} />);

    expect(screen.getByText("Coach panel body")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Profile" }));

    expect(screen.getByText("Current User")).toBeTruthy();
    expect(screen.getByText("Tel Aviv")).toBeTruthy();
    expect(screen.getByText("serious")).toBeTruthy();
    expect(screen.queryByText("Coach panel body")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "AI coach" }));

    expect(screen.getByText("Coach panel body")).toBeTruthy();
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

    fireEvent.click(screen.getByRole("button", { name: "Matches" }));

    expect(screen.getByText(/Unlock matching/)).toBeTruthy();
    expect(screen.getByText(/ready/i)).toBeTruthy();
  });
});

function baseData(overrides: Partial<NonNullable<MatchesPageData["profile"]>> = {}): MatchesPageData {
  return {
    profile: {
      userId: "user-1",
      displayName: "Current User",
      relationshipIntention: "serious",
      locationText: "Tel Aviv",
      completedDepthQuestionnaireAt: null,
      matchingProfileComplete: true,
      hasMatchingEntitlement: false,
      ...overrides,
    },
    matches: [],
  };
}
