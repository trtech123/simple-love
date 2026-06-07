import { requireAdminApiActor } from "../auth";
import { listReports } from "../recovery-operations";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;
  return listReports();
}
