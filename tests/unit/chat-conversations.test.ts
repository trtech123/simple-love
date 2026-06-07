import { beforeEach, describe, expect, it } from "vitest";
import {
  ChatAccessError,
  createOrGetConversationForMatch,
  createUserReport,
  sendConversationMessage,
  type ChatRepository,
  type ConversationRecord,
  type MatchRecord,
  type MessageRecord,
  type ProfileRecord,
  type UserReportRecord,
} from "../../src/domain/chat/conversations";

const activeMatch: MatchRecord = {
  id: "match-1",
  userA: "user-a",
  userB: "user-b",
  status: "active",
};

const profiles: ProfileRecord[] = [
  { userId: "user-a", displayName: "User A", disabledAt: null },
  { userId: "user-b", displayName: "User B", disabledAt: null },
];

class FakeChatRepository implements ChatRepository {
  matches = new Map<string, MatchRecord>([[activeMatch.id, activeMatch]]);
  conversations = new Map<string, ConversationRecord>();
  messages: MessageRecord[] = [];
  reports: UserReportRecord[] = [];
  blockedPairs: [string, string][] = [];
  profiles = new Map(profiles.map((profile) => [profile.userId, profile]));
  createConversationCalls = 0;

  async getMatch(matchId: string) {
    return this.matches.get(matchId) ?? null;
  }

  async getConversationByMatchId(matchId: string) {
    return [...this.conversations.values()].find((conversation) => conversation.matchId === matchId) ?? null;
  }

  async createConversationForMatch(matchId: string) {
    this.createConversationCalls += 1;
    const existing = await this.getConversationByMatchId(matchId);
    if (existing) {
      return existing;
    }

    const conversation = {
      id: `conversation-${this.conversations.size + 1}`,
      matchId,
      status: "active" as const,
    };
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  async getConversation(conversationId: string) {
    return this.conversations.get(conversationId) ?? null;
  }

  async getProfiles(userIds: string[]) {
    return userIds.map((userId) => this.profiles.get(userId)).filter((profile): profile is ProfileRecord => Boolean(profile));
  }

  async getBlockedPairs(userA: string, userB: string) {
    return this.blockedPairs.filter(
      ([blocker, blocked]) =>
        (blocker === userA && blocked === userB) || (blocker === userB && blocked === userA),
    );
  }

  async blockUser(input: { blockerId: string; blockedUserId: string; conversationId: string }) {
    this.blockedPairs.push([input.blockerId, input.blockedUserId]);
    const conversation = this.conversations.get(input.conversationId);
    if (conversation) {
      conversation.status = "blocked";
      this.conversations.set(input.conversationId, conversation);
    }
    return { blockedUserId: input.blockedUserId, conversationStatus: conversation?.status ?? ("blocked" as const) };
  }

  async insertMessage(input: { conversationId: string; senderId: string; body: string }) {
    const message = {
      id: `message-${this.messages.length + 1}`,
      conversationId: input.conversationId,
      senderId: input.senderId,
      body: input.body,
      createdAt: new Date(2026, 5, 2, 12, this.messages.length).toISOString(),
    };
    this.messages.push(message);
    return message;
  }

  async insertReport(input: {
    reporterId: string;
    reportedUserId: string;
    conversationId: string;
    messageIds: string[];
    reason: string;
  }) {
    const report = {
      id: `report-${this.reports.length + 1}`,
      reporterId: input.reporterId,
      reportedUserId: input.reportedUserId,
      conversationId: input.conversationId,
      messageIds: input.messageIds,
      reason: input.reason,
      createdAt: new Date(2026, 5, 2, 13, this.reports.length).toISOString(),
    };
    this.reports.push(report);
    return report;
  }
}

describe("chat conversations", () => {
  let repository: FakeChatRepository;

  beforeEach(() => {
    repository = new FakeChatRepository();
  });

  it("creates one conversation for an active match participant", async () => {
    const result = await createOrGetConversationForMatch(repository, {
      matchId: "match-1",
      userId: "user-a",
    });

    expect(result).toEqual({ conversationId: "conversation-1" });
    expect(repository.createConversationCalls).toBe(1);
  });

  it("reuses an existing conversation for the same match", async () => {
    await createOrGetConversationForMatch(repository, { matchId: "match-1", userId: "user-a" });
    const result = await createOrGetConversationForMatch(repository, { matchId: "match-1", userId: "user-b" });

    expect(result).toEqual({ conversationId: "conversation-1" });
    expect(repository.createConversationCalls).toBe(1);
  });

  it("rejects non-participants and inactive matches", async () => {
    await expect(
      createOrGetConversationForMatch(repository, { matchId: "match-1", userId: "user-c" }),
    ).rejects.toMatchObject({ code: "forbidden" });

    repository.matches.set("match-1", { ...activeMatch, status: "hidden" });
    await expect(
      createOrGetConversationForMatch(repository, { matchId: "match-1", userId: "user-a" }),
    ).rejects.toMatchObject({ code: "inactive_match" });
  });

  it("sends a trimmed message for an allowed participant", async () => {
    const { conversationId } = await createOrGetConversationForMatch(repository, {
      matchId: "match-1",
      userId: "user-a",
    });

    const message = await sendConversationMessage(repository, {
      conversationId,
      senderId: "user-a",
      body: "  hello  ",
    });

    expect(message).toEqual(expect.objectContaining({ body: "hello", senderId: "user-a" }));
    expect(repository.messages).toHaveLength(1);
  });

  it("rejects sends from non-participants, blocked pairs, inactive state, and invalid bodies", async () => {
    const { conversationId } = await createOrGetConversationForMatch(repository, {
      matchId: "match-1",
      userId: "user-a",
    });

    await expect(sendConversationMessage(repository, { conversationId, senderId: "user-c", body: "hi" })).rejects.toBeInstanceOf(
      ChatAccessError,
    );

    repository.blockedPairs = [["user-b", "user-a"]];
    await expect(sendConversationMessage(repository, { conversationId, senderId: "user-a", body: "hi" })).rejects.toMatchObject({
      code: "blocked",
    });

    repository.blockedPairs = [];
    repository.conversations.set(conversationId, { id: conversationId, matchId: "match-1", status: "disabled" });
    await expect(sendConversationMessage(repository, { conversationId, senderId: "user-a", body: "hi" })).rejects.toMatchObject({
      code: "inactive_conversation",
    });

    repository.conversations.set(conversationId, { id: conversationId, matchId: "match-1", status: "active" });
    await expect(sendConversationMessage(repository, { conversationId, senderId: "user-a", body: "   " })).rejects.toMatchObject({
      code: "invalid_body",
    });
    await expect(
      sendConversationMessage(repository, { conversationId, senderId: "user-a", body: "a".repeat(4001) }),
    ).rejects.toMatchObject({ code: "invalid_body" });
  });

  it("rejects sends when either profile is disabled", async () => {
    const { conversationId } = await createOrGetConversationForMatch(repository, {
      matchId: "match-1",
      userId: "user-a",
    });
    repository.profiles.set("user-b", { userId: "user-b", displayName: "User B", disabledAt: "2026-06-02T00:00:00.000Z" });

    await expect(sendConversationMessage(repository, { conversationId, senderId: "user-a", body: "hi" })).rejects.toMatchObject({
      code: "disabled_profile",
    });
  });

  it("creates a report against the other conversation participant", async () => {
    const { conversationId } = await createOrGetConversationForMatch(repository, {
      matchId: "match-1",
      userId: "user-a",
    });

    const report = await createUserReport(repository, {
      conversationId,
      reporterId: "user-a",
      reason: "Unsafe message",
      messageIds: ["message-1"],
    });

    expect(report).toEqual(
      expect.objectContaining({
        reporterId: "user-a",
        reportedUserId: "user-b",
        conversationId,
        messageIds: ["message-1"],
        reason: "Unsafe message",
      }),
    );
  });
});
