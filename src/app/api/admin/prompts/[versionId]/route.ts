import { requireAdminApiActor } from "../../auth";
import { getPromptVersion, updatePromptDraft } from "../../versioned-content-operations";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ versionId: string }> }) {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;
  const { versionId } = await context.params;
  return getPromptVersion(versionId);
}

export async function PUT(request: Request, context: { params: Promise<{ versionId: string }> }) {
  const auth = await requireAdminApiActor();
  if (!auth.ok) return auth.response;
  const { versionId } = await context.params;
  const body = await request.json().catch(() => null);
  return updatePromptDraft(auth.actor.userId, versionId, body);
}
