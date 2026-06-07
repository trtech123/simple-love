import { requireAdminApiActor } from "../../../../auth";
import { disableConversation } from "../../../../recovery-operations";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;
  const { conversationId } = await context.params;
  return disableConversation(auth.actor.userId, conversationId);
}
