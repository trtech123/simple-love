import type {
  ChatRepository,
  ConversationRecord,
  MatchRecord,
  MessageRecord,
  ProfileRecord,
  UserReportRecord,
} from "@/domain/chat/conversations";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isE2eTestMode } from "@/lib/e2e-mode";
import { createE2eChatRepository, listE2eMessages } from "@/testing/e2e-chat-fixture";

type MatchRow = {
  id: string;
  user_a: string;
  user_b: string;
  status: "active" | "hidden" | "blocked";
};

type ConversationRow = {
  id: string;
  match_id: string;
  status: "active" | "blocked" | "disabled";
};

type ProfileRow = {
  user_id: string;
  display_name: string;
  disabled_at: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type UserReportRow = {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  conversation_id: string;
  message_ids: string[];
  reason: string;
  created_at: string;
};

export function createSupabaseChatRepository(supabase: SupabaseClient): ChatRepository {
  return {
    async getMatch(matchId) {
      const { data, error } = await supabase
        .from("matches")
        .select("id, user_a, user_b, status")
        .eq("id", matchId)
        .maybeSingle<MatchRow>();

      if (error) {
        throw new Error(error.message);
      }

      return data ? mapMatch(data) : null;
    },
    async getConversationByMatchId(matchId) {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, match_id, status")
        .eq("match_id", matchId)
        .maybeSingle<ConversationRow>();

      if (error) {
        throw new Error(error.message);
      }

      return data ? mapConversation(data) : null;
    },
    async createConversationForMatch(matchId) {
      const { data, error } = await supabase
        .from("conversations")
        .insert({ match_id: matchId })
        .select("id, match_id, status")
        .single<ConversationRow>();

      if (!error && data) {
        return mapConversation(data);
      }

      if (error && "code" in error && error.code === "23505") {
        const existing = await this.getConversationByMatchId(matchId);
        if (existing) {
          return existing;
        }
      }

      throw new Error(error?.message ?? "Could not create conversation");
    },
    async getConversation(conversationId) {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, match_id, status")
        .eq("id", conversationId)
        .maybeSingle<ConversationRow>();

      if (error) {
        throw new Error(error.message);
      }

      return data ? mapConversation(data) : null;
    },
    async getProfiles(userIds) {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, disabled_at")
        .in("user_id", userIds)
        .returns<ProfileRow[]>();

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []).map(mapProfile);
    },
    async getBlockedPairs(userA, userB) {
      const { data, error } = await supabase
        .from("user_blocks")
        .select("blocker_id, blocked_user_id")
        .or(`and(blocker_id.eq.${userA},blocked_user_id.eq.${userB}),and(blocker_id.eq.${userB},blocked_user_id.eq.${userA})`)
        .returns<{ blocker_id: string; blocked_user_id: string }[]>();

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []).map((row) => [row.blocker_id, row.blocked_user_id]);
    },
    async blockUser(input) {
      const { error: insertError } = await supabase.from("user_blocks").insert({
        blocker_id: input.blockerId,
        blocked_user_id: input.blockedUserId,
      });

      if (insertError) {
        if ("code" in insertError && insertError.code === "23505") {
          const { ChatAccessError } = await import("@/domain/chat/conversations");
          throw new ChatAccessError("already_blocked", "This user is already blocked");
        }
        throw new Error(insertError.message);
      }

      const { data, error: updateError } = await supabase
        .from("conversations")
        .update({ status: "blocked", updated_at: new Date().toISOString() })
        .eq("id", input.conversationId)
        .select("id, match_id, status")
        .single<ConversationRow>();

      if (updateError) {
        throw new Error(updateError.message);
      }

      return { blockedUserId: input.blockedUserId, conversationStatus: mapConversation(data).status };
    },
    async hasMatchingEntitlement(userId) {
      const { data, error } = await supabase
        .from("matching_entitlements")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle<{ user_id: string }>();

      if (error) {
        throw new Error(error.message);
      }

      return Boolean(data);
    },
    async insertMessage(input) {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: input.conversationId,
          sender_id: input.senderId,
          body: input.body,
        })
        .select("id, conversation_id, sender_id, body, created_at")
        .single<MessageRow>();

      if (error) {
        throw new Error(error.message);
      }

      return mapMessage(data);
    },
    async insertReport(input) {
      const { data, error } = await supabase
        .from("user_reports")
        .insert({
          reporter_id: input.reporterId,
          reported_user_id: input.reportedUserId,
          conversation_id: input.conversationId,
          message_ids: input.messageIds,
          reason: input.reason,
        })
        .select("id, reporter_id, reported_user_id, conversation_id, message_ids, reason, created_at")
        .single<UserReportRow>();

      if (error) {
        throw new Error(error.message);
      }

      return mapReport(data);
    },
  };
}

export function createChatRepository(supabase?: SupabaseClient): ChatRepository {
  if (isE2eTestMode()) {
    return createE2eChatRepository();
  }

  if (!supabase) {
    throw new Error("Missing Supabase client for chat repository");
  }

  return createSupabaseChatRepository(supabase);
}

export async function loadChatMessages(supabase: SupabaseClient | undefined, conversationId: string) {
  if (isE2eTestMode()) {
    return listE2eMessages(conversationId);
  }

  if (!supabase) {
    throw new Error("Missing Supabase client for chat messages");
  }

  return loadConversationMessages(supabase, conversationId);
}

export async function loadConversationMessages(supabase: SupabaseClient, conversationId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .returns<MessageRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapMessage);
}

export function mapMatch(row: MatchRow): MatchRecord {
  return {
    id: row.id,
    userA: row.user_a,
    userB: row.user_b,
    status: row.status,
  };
}

export function mapConversation(row: ConversationRow): ConversationRecord {
  return {
    id: row.id,
    matchId: row.match_id,
    status: row.status,
  };
}

export function mapProfile(row: ProfileRow): ProfileRecord {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    disabledAt: row.disabled_at,
  };
}

export function mapMessage(row: MessageRow): MessageRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

function mapReport(row: UserReportRow): UserReportRecord {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    reportedUserId: row.reported_user_id,
    conversationId: row.conversation_id,
    messageIds: row.message_ids,
    reason: row.reason,
    createdAt: row.created_at,
  };
}
