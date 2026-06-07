import { requireAdminApiActor } from "../../../auth";
import { publishQuestionnaireVersion } from "../../../versioned-content-operations";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ versionId: string }> }) {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;
  const { versionId } = await context.params;
  return publishQuestionnaireVersion(auth.actor.userId, versionId);
}
