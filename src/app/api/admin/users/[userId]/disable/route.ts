import { requireAdminApiActor } from "../../../auth";
import { disableUser } from "../../../recovery-operations";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;
  const { userId } = await context.params;
  return disableUser(auth.actor.userId, userId);
}
