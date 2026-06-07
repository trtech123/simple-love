export type AdminActor = {
  userId: string;
  role: string | null | undefined;
};

export function assertAdminRole(actor: AdminActor): asserts actor is AdminActor & { role: "admin" } {
  if (actor.role !== "admin") {
    throw new Error("Admin access required");
  }
}
