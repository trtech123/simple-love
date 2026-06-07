import { requireMatchingAdminApiActor } from "../../../auth";
import { archiveMatchSettingsVersion } from "../../../operations";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ versionId: string }> }) {
  const auth = await requireMatchingAdminApiActor();
  if (!auth.ok) return auth.response;

  const { versionId } = await context.params;
  return archiveMatchSettingsVersion(auth.actor.userId, versionId);
}
