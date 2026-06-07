export type AuditLogInput = {
  actorUserId: string;
  action: string;
  targetTable: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
};

export function buildAuditLog(input: AuditLogInput) {
  return {
    actor_user_id: input.actorUserId,
    action: input.action,
    target_table: input.targetTable,
    target_id: input.targetId ?? null,
    metadata: input.metadata ?? {},
  };
}
