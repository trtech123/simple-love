import { createChatRepository } from "@/app/api/chat-repository";
import { apiError, apiSuccess } from "@/app/api/envelope";
import { requireAuthenticatedUserId } from "@/app/api/matching/auth";
import { blockConversationParticipant, ChatAccessError } from "@/domain/chat/conversations";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const userId = await requireAuthenticatedUserId();
  if (!userId) {
    return apiError({
      status: 401,
      code: "authentication_required",
      message: "צריך להתחבר כדי להמשיך.",
    });
  }

  const { conversationId } = await context.params;
  const repository = createChatRepository(createServiceRoleClient());

  try {
    const result = await blockConversationParticipant(repository, {
      conversationId,
      blockerId: userId,
    });
    return apiSuccess(result);
  } catch (error) {
    if (error instanceof ChatAccessError) {
      return apiError({
        status: statusForBlockError(error),
        code: codeForBlockError(error),
        message: messageForBlockError(error),
      });
    }

    return apiError({
      status: 500,
      code: "server_error",
      message: "אי אפשר לחסום את המשתמש כרגע.",
    });
  }
}

function statusForBlockError(error: ChatAccessError) {
  if (error.code === "not_found") return 404;
  if (error.code === "already_blocked") return 409;
  return 403;
}

function codeForBlockError(error: ChatAccessError) {
  if (error.code === "not_found" || error.code === "already_blocked" || error.code === "forbidden") {
    return error.code;
  }

  return "forbidden";
}

function messageForBlockError(error: ChatAccessError) {
  if (error.code === "not_found") return "השיחה לא נמצאה.";
  if (error.code === "forbidden") return "אין לך גישה לשיחה הזו.";
  if (error.code === "already_blocked") return "המשתמש כבר חסום.";
  return error.message;
}
