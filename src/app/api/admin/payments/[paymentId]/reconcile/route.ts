import { requireAdminApiActor } from "../../../auth";
import { reconcilePayment } from "../../../recovery-operations";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ paymentId: string }> }) {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;
  const { paymentId } = await context.params;
  return reconcilePayment(auth.actor.userId, paymentId);
}
