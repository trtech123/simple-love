import { requireMatchingAdminApiActor } from "../../auth";
import { getMatchSettingsVersion, updateMatchSettingsDraft } from "../../operations";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ versionId: string }> }) {
  const auth = await requireMatchingAdminApiActor();
  if (!auth.ok) return auth.response;

  const { versionId } = await context.params;
  return getMatchSettingsVersion(versionId);
}

export async function PUT(request: Request, context: { params: Promise<{ versionId: string }> }) {
  const auth = await requireMatchingAdminApiActor();
  if (!auth.ok) return auth.response;

  const { versionId } = await context.params;
  const body = await request.json().catch(() => null);
  return updateMatchSettingsDraft(auth.actor.userId, versionId, body);
}
