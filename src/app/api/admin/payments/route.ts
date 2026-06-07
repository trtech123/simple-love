import { requireAdminApiActor } from "../auth";
import { listPayments } from "../recovery-operations";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;
  return listPayments();
}
