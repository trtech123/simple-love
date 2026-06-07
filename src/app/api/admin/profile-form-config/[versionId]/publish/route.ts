import { requireAdminApiActor } from "../../auth";
import { publishProfileFormConfigVersion } from "../../operations";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ versionId: string }> }) {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;

  const { versionId } = await context.params;
  return publishProfileFormConfigVersion(auth.actor.userId, versionId);
}
