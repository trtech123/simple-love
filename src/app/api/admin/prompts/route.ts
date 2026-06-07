import { requireAdminApiActor } from "../auth";
import { createPromptDraft, listPromptVersions } from "../versioned-content-operations";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;
  return listPromptVersions();
}

export async function POST(request: Request) {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  return createPromptDraft(auth.actor.userId, body);
}
