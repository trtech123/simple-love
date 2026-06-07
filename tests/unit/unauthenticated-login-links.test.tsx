import React from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

vi.mock("@/app/api/matching/auth", () => ({
  requireAuthenticatedUserId: async () => null,
}));

describe("unauthenticated app states", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("links matches, matching profile, and chat pages to login with a return path", async () => {
    const MatchesPage = (await import("../../src/app/matches/page")).default;
    const MatchingProfilePage = (await import("../../src/app/profile/matching/page")).default;
    const ChatPage = (await import("../../src/app/chat/[conversationId]/page")).default;

    expect(renderToString(await MatchesPage())).toContain('href="/login?next=%2Fmatches"');
    expect(renderToString(await MatchingProfilePage())).toContain(
      'href="/login?next=%2Fprofile%2Fmatching"',
    );
    expect(
      renderToString(
        await ChatPage({ params: Promise.resolve({ conversationId: "conversation-1" }) }),
      ),
    ).toContain('href="/login?next=%2Fchat%2Fconversation-1"');
  });
});
