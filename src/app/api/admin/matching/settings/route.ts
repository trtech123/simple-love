import { requireMatchingAdminApiActor } from "../auth";
import { createMatchSettingsDraft, listMatchSettingsVersions } from "../operations";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireMatchingAdminApiActor();
  if (!auth.ok) return auth.response;

  return listMatchSettingsVersions();
}

export async function POST(request: Request) {
  const auth = await requireMatchingAdminApiActor();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  return createMatchSettingsDraft(auth.actor.userId, body);
}
