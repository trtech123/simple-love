"use server";

import { buildAuditLog } from "@/domain/admin/audit";
import { canDisableConversation, canDisableUser } from "@/domain/admin/moderation-admin";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { requireAdminActionActor } from "./guard";

export async function disableModerationConversationAction(formData: FormData) {
  const actor = await requireAdminActionActor();
  const conversationId = String(formData.get("conversationId") ?? "");
  if (!conversationId) {
    throw new Error("Missing conversation id.");
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, status")
    .eq("id", conversationId)
    .maybeSingle<{ id: string; status: "active" | "blocked" | "disabled" }>();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Conversation was not found.");
  if (!canDisableConversation(data)) throw new Error("Conversation is already disabled.");

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("conversations")
    .update({ status: "disabled", updated_at: now })
    .eq("id", conversationId);
  if (updateError) throw new Error(updateError.message);

  await insertAudit(
    buildAuditLog({
      actorUserId: actor.userId,
      action: "moderation.conversation.disable",
      targetTable: "conversations",
      targetId: conversationId,
    }),
  );
  revalidatePath("/admin/moderation");
}

export async function disableModerationUserAction(formData: FormData) {
  const actor = await requireAdminActionActor();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) {
    throw new Error("Missing user id.");
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, disabled_at")
    .eq("user_id", userId)
    .maybeSingle<{ user_id: string; disabled_at: string | null }>();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("User was not found.");
  if (!canDisableUser({ disabledAt: data.disabled_at ? new Date(data.disabled_at) : null })) {
    throw new Error("User is already disabled.");
  }

  const disabledAt = new Date().toISOString();
  const { error: updateError } = await supabase.from("profiles").update({ disabled_at: disabledAt }).eq("user_id", userId);
  if (updateError) throw new Error(updateError.message);

  await insertAudit(
    buildAuditLog({
      actorUserId: actor.userId,
      action: "users.disable",
      targetTable: "profiles",
      targetId: userId,
    }),
  );
  revalidatePath("/admin/moderation");
}

async function insertAudit(row: Record<string, unknown>) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("admin_audit_logs").insert(row);
  if (error) {
    throw new Error(error.message);
  }
}
