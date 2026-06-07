import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatRepository, ConversationRecord, MatchRecord, MessageRecord, ProfileRecord } from "../../src/domain/chat/conversations";

const activeMatch: MatchRecord = {
  id: "match-1",
  userA: "user-a",
  userB: "user-b",
  status: "active",
};

const activeConversation: ConversationRecord = {
  id: "conversation-1",
  matchId: "match-1",
  status: "active",
};

const initialMessages: MessageRecord[] = [
  {
    id: "message-1",
    conversationId: "conversation-1",
    senderId: "user-b",
    body: "first",
    createdAt: "2026-06-02T10:00:00.000Z",
  },
];

const profiles: ProfileRecord[] = [
  { userId: "user-a", displayName: "User A", disabledAt: null },
  { userId: "user-b", displayName: "User B", disabledAt: null },
];

const state = {
  userId: "user-a" as string | null,
  messages: [...initialMessages] as MessageRecord[],
  reports: [] as unknown[],
  blockedPairs: [] as [string, string][],
  conversationStatus: "active" as ConversationRecord["status"],
};

const repository: ChatRepository = {
  async getMatch(matchId) {
    return matchId === "match-1" ? activeMatch : null;
  },
  async getConversationByMatchId(matchId) {
    return matchId === "match-1" ? activeConversation : null;
  },
  async createConversationForMatch() {
    return activeConversation;
  },
  async getConversation(conversationId) {
    return conversationId === "conversation-1" ? { ...activeConversation, status: state.conversationStatus } : null;
  },
  async getProfiles() {
    return profiles;
  },
  async getBlockedPairs() {
    return state.blockedPairs;
  },
  async insertMessage(input) {
    const message = {
      id: `message-${state.messages.length + 1}`,
      conversationId: input.conversationId,
      senderId: input.senderId,
      body: input.body,
      createdAt: "2026-06-02T10:01:00.000Z",
    };
    state.messages.push(message);
    return message;
  },
  async insertReport(input) {
    const report = {
      id: `report-${state.reports.length + 1}`,
      ...input,
      createdAt: "2026-06-02T10:02:00.000Z",
    };
    state.reports.push(report);
    return report;
  },
  async blockUser(input: { blockerId: string; blockedUserId: string; conversationId: string }) {
    state.blockedPairs.push([input.blockerId, input.blockedUserId]);
    state.conversationStatus = "blocked";
    return { blockedUserId: input.blockedUserId, conversationStatus: state.conversationStatus };
  },
} as ChatRepository;

vi.mock("@/app/api/matching/auth", () => ({
  requireAuthenticatedUserId: () => state.userId,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: () => ({}),
}));

vi.mock("@/app/api/chat-repository", () => ({
  createChatRepository: () => repository,
  createSupabaseChatRepository: () => repository,
  loadChatMessages: () => state.messages,
  loadConversationMessages: () => state.messages,
}));

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("chat API routes", () => {
  beforeEach(() => {
    state.userId = "user-a";
    state.messages = [...initialMessages];
    state.reports = [];
    state.blockedPairs = [];
    state.conversationStatus = "active";
  });

  it("creates or returns a conversation for a match", async () => {
    const { POST } = await import("../../src/app/api/matches/[matchId]/conversation/route");

    const response = await POST(new Request("http://localhost/api/matches/match-1/conversation"), {
      params: Promise.resolve({ matchId: "match-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ conversationId: "conversation-1" });
  });

  it("returns 401 when opening chat without authentication", async () => {
    const { POST } = await import("../../src/app/api/matches/[matchId]/conversation/route");
    state.userId = null;

    const response = await POST(new Request("http://localhost/api/matches/match-1/conversation"), {
      params: Promise.resolve({ matchId: "match-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("returns conversation metadata and ordered messages to a participant", async () => {
    const { GET } = await import("../../src/app/api/conversations/[conversationId]/route");

    const response = await GET(new Request("http://localhost/api/conversations/conversation-1"), {
      params: Promise.resolve({ conversationId: "conversation-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        currentUserId: "user-a",
        otherProfile: expect.objectContaining({ userId: "user-b" }),
        messages: initialMessages,
        canSend: true,
      }),
    );
  });

  it("persists a message for an allowed participant", async () => {
    const { POST } = await import("../../src/app/api/conversations/[conversationId]/messages/route");

    const response = await POST(jsonRequest("http://localhost/api/conversations/conversation-1/messages", { body: "  hi  " }), {
      params: Promise.resolve({ conversationId: "conversation-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: expect.objectContaining({ id: "message-2", senderId: "user-a", body: "hi" }),
    });
  });

  it("blocks the other conversation participant and marks the conversation blocked", async () => {
    const { POST } = await import("../../src/app/api/conversations/[conversationId]/block/route");

    const response = await POST(new Request("http://localhost/api/conversations/conversation-1/block", { method: "POST" }), {
      params: Promise.resolve({ conversationId: "conversation-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { blockedUserId: "user-b", conversationStatus: "blocked" },
    });
    expect(state.blockedPairs).toEqual([["user-a", "user-b"]]);
  });

  it("returns stable conversation_blocked code when either participant blocked the other", async () => {
    const { POST } = await import("../../src/app/api/conversations/[conversationId]/messages/route");
    state.blockedPairs = [["user-b", "user-a"]];

    const response = await POST(jsonRequest("http://localhost/api/conversations/conversation-1/messages", { body: "hi" }), {
      params: Promise.resolve({ conversationId: "conversation-1" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "conversation_blocked" });
  });

  it("persists a report for the other participant", async () => {
    const { POST } = await import("../../src/app/api/conversations/[conversationId]/reports/route");

    const response = await POST(
      jsonRequest("http://localhost/api/conversations/conversation-1/reports", {
        reason: "Unsafe",
        messageIds: ["message-1"],
      }),
      { params: Promise.resolve({ conversationId: "conversation-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      report: expect.objectContaining({
        reporterId: "user-a",
        reportedUserId: "user-b",
        conversationId: "conversation-1",
        messageIds: ["message-1"],
      }),
    });
  });
});
