import { beforeEach, describe, expect, it } from "vitest";
import { loadMatchesPageData } from "../../src/app/matches/matches-loader";
import { resetE2eChatFixture } from "../../src/testing/e2e-chat-fixture";

describe("loadMatchesPageData", () => {
  beforeEach(() => {
    resetE2eChatFixture();
  });

  it("uses fixture data in e2e mode", async () => {
    const data = await loadMatchesPageData("user-a", { e2eMode: true });

    expect(data.profile?.displayName).toBe("User A");
    expect(data.matches).toEqual([
      expect.objectContaining({
        id: "match-1",
        score: 93,
        explanationSummary: expect.any(String),
        explanationReasons: expect.arrayContaining([expect.any(String)]),
        otherProfile: expect.objectContaining({ displayName: "User B" }),
      }),
    ]);
  });
});
