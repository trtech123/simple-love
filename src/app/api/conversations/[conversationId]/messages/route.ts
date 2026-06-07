import { chatErrorResponse } from "@/app/api/chat-errors";
import { createChatRepository } from "@/app/api/chat-repository";
import { sendConversationMessage } from "@/domain/chat/conversations";
import { requireAuthenticatedUserId } from "@/app/api/matching/auth";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const messageSchema = z.object({
  body: z.string(),
});

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const userId = await requireAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "תוכן ההודעה אינו תקין." }, { status: 400 });
  }

  const { conversationId } = await context.params;
  const repository = createChatRepository(createServiceRoleClient());

  try {
    const message = await sendConversationMessage(repository, {
      conversationId,
      senderId: userId,
      body: parsed.data.body,
    });
    return NextResponse.json({ message });
  } catch (error) {
    return chatErrorResponse(error);
  }
}
