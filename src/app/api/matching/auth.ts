import { createClient } from "@/lib/supabase/server";
import { isE2eTestMode } from "@/lib/e2e-mode";
import { cookies } from "next/headers";

export async function requireAuthenticatedUserId() {
  if (isE2eTestMode()) {
    const cookieStore = await cookies();
    return cookieStore.get("lovlov_e2e_user_id")?.value ?? null;
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user.id;
}
