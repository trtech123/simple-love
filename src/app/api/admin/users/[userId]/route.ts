import { requireAdminApiActor } from "../../auth";
import { getUser } from "../../recovery-operations";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;
  const { userId } = await context.params;
  return getUser(userId);
}
