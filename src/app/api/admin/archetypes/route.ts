import { requireAdminApiActor } from "../auth";
import { createArchetypeDraft, listArchetypeVersions } from "../versioned-content-operations";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;
  return listArchetypeVersions();
}

export async function POST(request: Request) {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  return createArchetypeDraft(auth.actor.userId, body);
}
