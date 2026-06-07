import type {
  ChatRepository,
  ConversationRecord,
  MatchRecord,
  MessageRecord,
  ProfileRecord,
  UserReportRecord,
} from "@/domain/chat/conversations";

type FixtureProfile = ProfileRecord & {
  relationshipIntention: string | null;
  locationText: string | null;
  completedDepthQuestionnaireAt: string | null;
  matchingProfileComplete: boolean;
};

type FixtureMatch = MatchRecord & {
  score: number;
  explanationSummary?: string;
  explanationReasons?: string[];
};

type FixtureState = {
  conversations: ConversationRecord[];
  messages: MessageRecord[];
  reports: UserReportRecord[];
  blockedPairs: [string, string][];
  messageCounter: number;
};

export type E2eMatchPageData = {
  profile: FixtureProfile | null;
  matches: Array<FixtureMatch & { otherProfile: FixtureProfile | null }>;
};

const seedProfiles = new Map<string, FixtureProfile>([
  [
    "user-incomplete-profile",
    {
      userId: "user-incomplete-profile",
      displayName: "Incomplete Profile",
      disabledAt: null,
      relationshipIntention: null,
      locationText: null,
      completedDepthQuestionnaireAt: null,
      matchingProfileComplete: false,
    },
  ],
  [
    "user-profile-only",
    {
      userId: "user-profile-only",
      displayName: "Profile Only",
      disabledAt: null,
      relationshipIntention: "Long-term relationship",
      locationText: "Tel Aviv",
      completedDepthQuestionnaireAt: null,
      matchingProfileComplete: true,
    },
  ],
  [
    "user-a",
    {
      userId: "user-a",
      displayName: "User A",
      disabledAt: null,
      relationshipIntention: "Long-term relationship",
      locationText: "Tel Aviv",
      completedDepthQuestionnaireAt: "2026-06-02T10:00:00.000Z",
      matchingProfileComplete: true,
    },
  ],
  [
    "user-b",
    {
      userId: "user-b",
      displayName: "User B",
      disabledAt: null,
      relationshipIntention: "Long-term relationship",
      locationText: "Jerusalem",
      completedDepthQuestionnaireAt: "2026-06-02T10:00:00.000Z",
      matchingProfileComplete: true,
    },
  ],
]);

const seedMatches: FixtureMatch[] = [
  {
    id: "match-1",
    userA: "user-a",
    userB: "user-b",
    status: "active",
    score: 93,
    explanationSummary: "Strong fit across the matching profile, questionnaire traits, and practical preferences.",
    explanationReasons: ["Aligned emotional profile.", "Practical preferences are a close fit."],
  },
];

export function resetE2eChatFixture() {
  const state = getState();
  state.conversations = [];
  state.messages = [];
  state.reports = [];
  state.blockedPairs = [];
  state.messageCounter = 0;
}

export async function getE2eMatchesPageData(userId: string): Promise<E2eMatchPageData> {
  const profile = seedProfiles.get(userId) ?? null;
  const matches = seedMatches
    .filter((match) => match.status === "active" && (match.userA === userId || match.userB === userId))
    .map((match) => ({
      ...match,
      otherProfile: seedProfiles.get(match.userA === userId ? match.userB : match.userA) ?? null,
    }));

  return { profile, matches };
}

export function createE2eChatRepository(): ChatRepository {
  return {
    async getMatch(matchId) {
      return seedMatches.find((match) => match.id === matchId) ?? null;
    },
    async getConversationByMatchId(matchId) {
      return getState().conversations.find((conversation) => conversation.matchId === matchId) ?? null;
    },
    async createConversationForMatch(matchId) {
      const state = getState();
      const existing = state.conversations.find((conversation) => conversation.matchId === matchId);
      if (existing) {
        return existing;
      }

      const conversation = { id: "conversation-1", matchId, status: "active" as const };
      state.conversations.push(conversation);
      return conversation;
    },
    async getConversation(conversationId) {
      return getState().conversations.find((conversation) => conversation.id === conversationId) ?? null;
    },
    async getProfiles(userIds) {
      return userIds.map((userId) => seedProfiles.get(userId)).filter((profile): profile is FixtureProfile => Boolean(profile));
    },
    async getBlockedPairs() {
      return getState().blockedPairs;
    },
    async blockUser(input) {
      const state = getState();
      state.blockedPairs.push([input.blockerId, input.blockedUserId]);
      const conversation = state.conversations.find((item) => item.id === input.conversationId);
      if (conversation) {
        conversation.status = "blocked";
      }
      return { blockedUserId: input.blockedUserId, conversationStatus: conversation?.status ?? "blocked" };
    },
    async insertMessage(input) {
      const message = buildMessage(input.conversationId, input.senderId, input.body);
      getState().messages.push(message);
      return message;
    },
    async insertReport(input) {
      const state = getState();
      const report = {
        id: `report-${state.reports.length + 1}`,
        ...input,
        createdAt: new Date(Date.UTC(2026, 5, 2, 10, 2, state.reports.length)).toISOString(),
      };
      state.reports.push(report);
      return report;
    },
  };
}

export async function listE2eMessages(conversationId: string) {
  return getState().messages.filter((message) => message.conversationId === conversationId);
}

export function insertE2eInboundMessage(conversationId: string, input: { body: string; senderId?: string }) {
  const message = buildMessage(conversationId, input.senderId ?? "user-b", input.body.trim());
  getState().messages.push(message);
  return message;
}

function buildMessage(conversationId: string, senderId: string, body: string): MessageRecord {
  const state = getState();
  state.messageCounter += 1;
  return {
    id: `message-${state.messageCounter}`,
    conversationId,
    senderId,
    body,
    createdAt: new Date(Date.UTC(2026, 5, 2, 10, 1, state.messageCounter)).toISOString(),
  };
}

function getState(): FixtureState {
  const globalState = globalThis as typeof globalThis & { __lovlovE2eChatFixture?: FixtureState };
  globalState.__lovlovE2eChatFixture ??= {
    conversations: [],
    messages: [],
    reports: [],
    blockedPairs: [],
    messageCounter: 0,
  };

  return globalState.__lovlovE2eChatFixture;
}
