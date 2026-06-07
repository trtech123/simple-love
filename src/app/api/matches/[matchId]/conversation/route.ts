import { createOrGetConversationForMatch } from "@/domain/chat/conversations";
import { chatErrorResponse } from "@/app/api/chat-errors";
import { createChatRepository } from "@/app/api/chat-repository";
import { requireAuthenticatedUserId } from "@/app/api/matching/auth";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ matchId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const userId = await requireAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { matchId } = await context.params;
  const repository = createChatRepository(createServiceRoleClient());

  try {
    const result = await createOrGetConversationForMatch(repository, { matchId, userId });
    return NextResponse.json(result);
  } catch (error) {
    return chatErrorResponse(error);
  }
}
