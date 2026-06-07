import { requireAdminApiActor } from "../../../auth";
import { retryReport } from "../../../recovery-operations";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ reportId: string }> }) {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;
  const { reportId } = await context.params;
  const body = await request.json().catch(() => null);
  return retryReport(auth.actor.userId, reportId, body);
}
