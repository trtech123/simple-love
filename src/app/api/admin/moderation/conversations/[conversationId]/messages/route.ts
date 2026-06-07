import { requireAdminApiActor } from "../../../../auth";
import { listModerationConversationMessages } from "../../../../recovery-operations";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;

  const { conversationId } = await context.params;
  const reportId = new URL(request.url).searchParams.get("reportId");
  return listModerationConversationMessages(auth.actor.userId, conversationId, reportId);
}
