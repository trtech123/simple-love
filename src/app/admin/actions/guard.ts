"use server";

import { requireAdminActorFromUser } from "@/domain/admin/version-operations";
import { createClient } from "@/lib/supabase/server";

export async function requireAdminActionActor() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error("נדרשת הרשאת מנהל.");
  }

  return requireAdminActorFromUser(data.user);
}
