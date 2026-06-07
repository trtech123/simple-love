import { notFound } from "next/navigation";

import { requireAdminActorFromUser } from "@/domain/admin/version-operations";
import { createClient } from "@/lib/supabase/server";

export async function requireAdminPageAccess() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    notFound();
  }

  try {
    return requireAdminActorFromUser(data.user);
  } catch {
    notFound();
  }
}
