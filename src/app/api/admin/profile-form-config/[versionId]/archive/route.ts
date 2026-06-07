import { requireAdminApiActor } from "../../auth";
import { archiveProfileFormConfigVersion } from "../../operations";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ versionId: string }> }) {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;

  const { versionId } = await context.params;
  return archiveProfileFormConfigVersion(auth.actor.userId, versionId);
}
