import { requireAdminApiActor } from "../auth";

export async function requireMatchingAdminApiActor() {
  return requireAdminApiActor();
}
