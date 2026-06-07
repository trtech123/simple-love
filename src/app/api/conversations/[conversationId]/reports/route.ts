import { chatErrorResponse } from "@/app/api/chat-errors";
import { createChatRepository } from "@/app/api/chat-repository";
import { createUserReport } from "@/domain/chat/conversations";
import { requireAuthenticatedUserId } from "@/app/api/matching/auth";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const reportSchema = z.object({
  reason: z.string(),
  messageIds: z.array(z.string()).optional(),
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
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "פרטי הדיווח אינם תקינים." }, { status: 400 });
  }

  const { conversationId } = await context.params;
  const repository = createChatRepository(createServiceRoleClient());

  try {
    const report = await createUserReport(repository, {
      conversationId,
      reporterId: userId,
      reason: parsed.data.reason,
      messageIds: parsed.data.messageIds,
    });
    return NextResponse.json({ report });
  } catch (error) {
    return chatErrorResponse(error);
  }
}
