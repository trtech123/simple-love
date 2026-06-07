import { beforeEach, describe, expect, it } from "vitest";
import {
  createE2eChatRepository,
  getE2eMatchesPageData,
  insertE2eInboundMessage,
  listE2eMessages,
  resetE2eChatFixture,
} from "../../src/testing/e2e-chat-fixture";

describe("e2e chat fixture", () => {
  beforeEach(() => {
    resetE2eChatFixture();
  });

  it("returns deterministic matches page data for user-a", async () => {
    const data = await getE2eMatchesPageData("user-a");

    expect(data.profile?.displayName).toBe("User A");
    expect(data.profile?.completedDepthQuestionnaireAt).toBeTruthy();
    expect(data.matches).toEqual([
      expect.objectContaining({
        id: "match-1",
        score: 93,
        otherProfile: expect.objectContaining({ displayName: "User B" }),
      }),
    ]);
  });

  it("creates and reuses one conversation for the fixture match", async () => {
    const repository = createE2eChatRepository();

    await expect(repository.getConversationByMatchId("match-1")).resolves.toBeNull();
    const created = await repository.createConversationForMatch("match-1");
    const reused = await repository.getConversationByMatchId("match-1");

    expect(created).toEqual({ id: "conversation-1", matchId: "match-1", status: "active" });
    expect(reused).toEqual(created);
  });

  it("stores messages, inbound messages, reports, and resets mutable state", async () => {
    const repository = createE2eChatRepository();
    await repository.createConversationForMatch("match-1");

    const sent = await repository.insertMessage({ conversationId: "conversation-1", senderId: "user-a", body: "Hi" });
    const inbound = insertE2eInboundMessage("conversation-1", { body: "Hello back" });
    const report = await repository.insertReport({
      conversationId: "conversation-1",
      reporterId: "user-a",
      reportedUserId: "user-b",
      messageIds: [sent.id, inbound.id],
      reason: "Unsafe",
    });

    expect((await listE2eMessages("conversation-1")).map((message) => message.body)).toEqual(["Hi", "Hello back"]);
    expect(report).toEqual(expect.objectContaining({ id: "report-1", reason: "Unsafe" }));

    resetE2eChatFixture();
    await expect(listE2eMessages("conversation-1")).resolves.toEqual([]);
  });
});
