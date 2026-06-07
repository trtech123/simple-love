import { requireAdminApiActor } from "../../../auth";
import { markPaymentFailed } from "../../../recovery-operations";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ paymentId: string }> }) {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;
  const { paymentId } = await context.params;
  const body = await request.json().catch(() => null);
  return markPaymentFailed(auth.actor.userId, paymentId, body);
}
