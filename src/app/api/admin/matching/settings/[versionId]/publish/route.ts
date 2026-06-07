import { requireMatchingAdminApiActor } from "../../../auth";
import { publishMatchSettingsVersion } from "../../../operations";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ versionId: string }> }) {
  const auth = await requireMatchingAdminApiActor();
  if (!auth.ok) return auth.response;

  const { versionId } = await context.params;
  return publishMatchSettingsVersion(auth.actor.userId, versionId);
}
