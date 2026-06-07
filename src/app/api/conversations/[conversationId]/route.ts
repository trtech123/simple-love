import { chatErrorResponse } from "@/app/api/chat-errors";
import { createChatRepository, loadChatMessages } from "@/app/api/chat-repository";
import { ChatAccessError } from "@/domain/chat/conversations";
import { requireAuthenticatedUserId } from "@/app/api/matching/auth";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const userId = await requireAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { conversationId } = await context.params;
  const supabase = createServiceRoleClient();
  const repository = createChatRepository(supabase);

  try {
    const conversation = await repository.getConversation(conversationId);
    if (!conversation) {
      throw new ChatAccessError("not_found", "Conversation was not found");
    }

    const match = await repository.getMatch(conversation.matchId);
    if (!match) {
      throw new ChatAccessError("not_found", "Match was not found");
    }

    if (match.userA !== userId && match.userB !== userId) {
      throw new ChatAccessError("forbidden", "You are not a participant in this conversation");
    }

    const participants = await repository.getProfiles([match.userA, match.userB]);
    const otherUserId = match.userA === userId ? match.userB : match.userA;
    const otherProfile = participants.find((profile) => profile.userId === otherUserId) ?? null;
    const currentProfile = participants.find((profile) => profile.userId === userId) ?? null;
    const blockedPairs = await repository.getBlockedPairs(match.userA, match.userB);
    const messages = await loadChatMessages(supabase, conversationId);
    const canSend =
      conversation.status === "active" &&
      match.status === "active" &&
      Boolean(currentProfile && otherProfile) &&
      !currentProfile?.disabledAt &&
      !otherProfile?.disabledAt &&
      blockedPairs.length === 0;

    return NextResponse.json({
      conversation,
      match,
      currentUserId: userId,
      otherProfile,
      messages,
      canSend,
    });
  } catch (error) {
    return chatErrorResponse(error);
  }
}
