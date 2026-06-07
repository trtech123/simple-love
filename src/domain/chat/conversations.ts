import { canSendMessage } from "./permissions";

export type MatchRecord = {
  id: string;
  userA: string;
  userB: string;
  status: "active" | "hidden" | "blocked";
};

export type ConversationRecord = {
  id: string;
  matchId: string;
  status: "active" | "blocked" | "disabled";
};

export type ProfileRecord = {
  userId: string;
  displayName: string;
  disabledAt: string | null;
};

export type MessageRecord = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

export type UserReportRecord = {
  id: string;
  reporterId: string;
  reportedUserId: string;
  conversationId: string;
  messageIds: string[];
  reason: string;
  createdAt: string;
};

export type ChatRepository = {
  getMatch(matchId: string): Promise<MatchRecord | null>;
  getConversationByMatchId(matchId: string): Promise<ConversationRecord | null>;
  createConversationForMatch(matchId: string): Promise<ConversationRecord>;
  getConversation(conversationId: string): Promise<ConversationRecord | null>;
  getProfiles(userIds: string[]): Promise<ProfileRecord[]>;
  getBlockedPairs(userA: string, userB: string): Promise<[string, string][]>;
  blockUser(input: {
    blockerId: string;
    blockedUserId: string;
    conversationId: string;
  }): Promise<{ blockedUserId: string; conversationStatus: ConversationRecord["status"] }>;
  hasMatchingEntitlement?(userId: string): Promise<boolean>;
  insertMessage(input: { conversationId: string; senderId: string; body: string }): Promise<MessageRecord>;
  insertReport(input: {
    reporterId: string;
    reportedUserId: string;
    conversationId: string;
    messageIds: string[];
    reason: string;
  }): Promise<UserReportRecord>;
};

export type ChatAccessErrorCode =
  | "not_found"
  | "forbidden"
  | "inactive_match"
  | "inactive_conversation"
  | "blocked"
  | "already_blocked"
  | "disabled_profile"
  | "invalid_body";

export class ChatAccessError extends Error {
  constructor(
    public readonly code: ChatAccessErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ChatAccessError";
  }
}

export async function createOrGetConversationForMatch(
  repository: ChatRepository,
  input: { matchId: string; userId: string },
) {
  const match = await repository.getMatch(input.matchId);
  assertActiveMatchParticipant(match, input.userId);
  await assertMatchingUnlocked(repository, input.userId);

  const existing = await repository.getConversationByMatchId(input.matchId);
  if (existing) {
    return { conversationId: existing.id };
  }

  const created = await repository.createConversationForMatch(input.matchId);
  return { conversationId: created.id };
}

export async function sendConversationMessage(
  repository: ChatRepository,
  input: { conversationId: string; senderId: string; body: string },
) {
  const body = input.body.trim();
  if (!body || body.length > 4000) {
    throw new ChatAccessError("invalid_body", "Message must be between 1 and 4000 characters");
  }

  const context = await loadConversationContext(repository, input.conversationId);
  assertCanSend(repository, context, input.senderId);
  await assertMatchingUnlocked(repository, input.senderId);
  await assertProfilesEnabled(repository, context.match);

  const blockedPairs = await repository.getBlockedPairs(context.match.userA, context.match.userB);
  if (
    !canSendMessage({
      senderId: input.senderId,
      participants: [context.match.userA, context.match.userB],
      conversationStatus: context.conversation.status,
      matchStatus: context.match.status,
      blockedPairs,
    })
  ) {
    throw new ChatAccessError("blocked", "Messaging is not available for this match");
  }

  return repository.insertMessage({ conversationId: input.conversationId, senderId: input.senderId, body });
}

export async function blockConversationParticipant(
  repository: ChatRepository,
  input: { conversationId: string; blockerId: string },
) {
  const context = await loadConversationContext(repository, input.conversationId);
  assertParticipant(context.match, input.blockerId);
  const blockedUserId = context.match.userA === input.blockerId ? context.match.userB : context.match.userA;

  const blockedPairs = await repository.getBlockedPairs(context.match.userA, context.match.userB);
  if (blockedPairs.some(([blocker, blocked]) => blocker === input.blockerId && blocked === blockedUserId)) {
    throw new ChatAccessError("already_blocked", "This user is already blocked");
  }

  return repository.blockUser({
    blockerId: input.blockerId,
    blockedUserId,
    conversationId: input.conversationId,
  });
}

export async function createUserReport(
  repository: ChatRepository,
  input: { conversationId: string; reporterId: string; reason: string; messageIds?: string[] },
) {
  const reason = input.reason.trim();
  if (!reason) {
    throw new ChatAccessError("invalid_body", "Report reason is required");
  }

  const context = await loadConversationContext(repository, input.conversationId);
  assertParticipant(context.match, input.reporterId);
  const reportedUserId = context.match.userA === input.reporterId ? context.match.userB : context.match.userA;

  return repository.insertReport({
    reporterId: input.reporterId,
    reportedUserId,
    conversationId: input.conversationId,
    messageIds: input.messageIds ?? [],
    reason,
  });
}

async function loadConversationContext(repository: ChatRepository, conversationId: string) {
  const conversation = await repository.getConversation(conversationId);
  if (!conversation) {
    throw new ChatAccessError("not_found", "Conversation was not found");
  }

  const match = await repository.getMatch(conversation.matchId);
  if (!match) {
    throw new ChatAccessError("not_found", "Match was not found");
  }

  return { conversation, match };
}

function assertActiveMatchParticipant(match: MatchRecord | null, userId: string): asserts match is MatchRecord {
  if (!match) {
    throw new ChatAccessError("not_found", "Match was not found");
  }

  assertParticipant(match, userId);

  if (match.status !== "active") {
    throw new ChatAccessError("inactive_match", "This match is not active");
  }
}

function assertParticipant(match: MatchRecord, userId: string) {
  if (match.userA !== userId && match.userB !== userId) {
    throw new ChatAccessError("forbidden", "You are not a participant in this match");
  }
}

function assertCanSend(
  repository: ChatRepository,
  context: { conversation: ConversationRecord; match: MatchRecord },
  senderId: string,
) {
  void repository;
  assertParticipant(context.match, senderId);

  if (context.match.status !== "active") {
    if (context.match.status === "blocked") {
      throw new ChatAccessError("blocked", "Messaging is not available for this match");
    }
    throw new ChatAccessError("inactive_match", "This match is not active");
  }

  if (context.conversation.status !== "active") {
    if (context.conversation.status === "blocked") {
      throw new ChatAccessError("blocked", "Messaging is not available for this match");
    }
    throw new ChatAccessError("inactive_conversation", "This conversation is not active");
  }
}

async function assertProfilesEnabled(repository: ChatRepository, match: MatchRecord) {
  const profiles = await repository.getProfiles([match.userA, match.userB]);
  if (profiles.length !== 2 || profiles.some((profile) => profile.disabledAt)) {
    throw new ChatAccessError("disabled_profile", "Messaging is not available for disabled profiles");
  }
}

async function assertMatchingUnlocked(repository: ChatRepository, userId: string) {
  if (repository.hasMatchingEntitlement && !(await repository.hasMatchingEntitlement(userId))) {
    throw new ChatAccessError("forbidden", "Matching and chat are not unlocked");
  }
}
