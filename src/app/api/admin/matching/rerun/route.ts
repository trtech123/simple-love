import { requireMatchingAdminApiActor } from "../auth";
import { rerunMatches } from "../operations";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireMatchingAdminApiActor();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  return rerunMatches(auth.actor.userId, body);
}
