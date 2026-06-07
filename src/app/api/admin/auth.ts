import { apiError } from "@/app/api/envelope";
import { requireAdminActorFromUser } from "@/domain/admin/version-operations";
import { createClient } from "@/lib/supabase/server";

export async function requireAdminApiActor() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return {
      ok: false as const,
      response: apiError({
        status: 401,
        code: "authentication_required",
        message: "צריך להתחבר כדי להמשיך.",
      }),
    };
  }

  try {
    return { ok: true as const, actor: requireAdminActorFromUser(data.user) };
  } catch {
    return {
      ok: false as const,
      response: apiError({
        status: 403,
        code: "forbidden",
        message: "אין לך הרשאת מנהל.",
      }),
    };
  }
}
