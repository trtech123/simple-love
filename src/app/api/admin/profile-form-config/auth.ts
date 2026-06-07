import { requireAdminApiActor as requireSharedAdminApiActor } from "../auth";

export async function requireAdminApiActor() {
  return requireSharedAdminApiActor();
}
