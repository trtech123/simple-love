import { requireAdminApiActor } from "./auth";
import { createProfileFormConfigDraft, listProfileFormConfigVersions } from "./operations";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;

  return listProfileFormConfigVersions();
}

export async function POST(request: Request) {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  return createProfileFormConfigDraft(auth.actor.userId, body);
}
