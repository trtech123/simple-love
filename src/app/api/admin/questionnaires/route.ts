import { requireAdminApiActor } from "../auth";
import { createQuestionnaireDraft, listQuestionnaireVersions } from "../versioned-content-operations";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;
  return listQuestionnaireVersions();
}

export async function POST(request: Request) {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  return createQuestionnaireDraft(auth.actor.userId, body);
}
