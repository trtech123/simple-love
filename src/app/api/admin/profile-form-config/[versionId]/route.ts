import { requireAdminApiActor } from "../auth";
import { getProfileFormConfigVersion, updateProfileFormConfigDraft } from "../operations";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ versionId: string }> }) {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;

  const { versionId } = await context.params;
  return getProfileFormConfigVersion(versionId);
}

export async function PUT(request: Request, context: { params: Promise<{ versionId: string }> }) {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;

  const { versionId } = await context.params;
  const body = await request.json().catch(() => null);
  return updateProfileFormConfigDraft(auth.actor.userId, versionId, body);
}
