import { apiError, apiSuccess } from "@/app/api/envelope";
import { requireAuthenticatedUserId } from "@/app/api/matching/auth";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireAuthenticatedUserId();
  if (!userId) {
    return apiError({ status: 401, code: "authentication_required", message: "צריך להתחבר כדי להמשיך." });
  }

  const supabase = createServiceRoleClient();
  const thread = await ensureActiveThread(supabase, userId);
  const [messages, softSignals, suggestions] = await Promise.all([
    loadMessages(supabase, thread.id),
    loadSoftSignals(supabase, userId),
    loadSuggestions(supabase, userId),
  ]);

  return apiSuccess({ thread, messages, softSignals, suggestions });
}

async function ensureActiveThread(supabase: ReturnType<typeof createServiceRoleClient>, userId: string) {
  const existing = await supabase
    .from("ai_coach_threads")
    .select("id, user_id, status, created_at, updated_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    throw new Error(existing.error.message);
  }

  if (existing.data) {
    return existing.data;
  }

  const created = await supabase
    .from("ai_coach_threads")
    .insert({ user_id: userId, status: "active" })
    .select("id, user_id, status, created_at, updated_at")
    .single();

  if (created.error || !created.data) {
    throw new Error(created.error?.message ?? "Could not create AI coach thread");
  }

  return created.data;
}

async function loadMessages(supabase: ReturnType<typeof createServiceRoleClient>, threadId: string) {
  const { data, error } = await supabase
    .from("ai_coach_messages")
    .select("id, role, content, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadSoftSignals(supabase: ReturnType<typeof createServiceRoleClient>, userId: string) {
  const { data, error } = await supabase
    .from("ai_coach_soft_signals")
    .select("id, trait_key, delta, rationale, status, updated_at")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadSuggestions(supabase: ReturnType<typeof createServiceRoleClient>, userId: string) {
  const { data, error } = await supabase
    .from("ai_coach_hard_filter_suggestions")
    .select("id, field, value, rationale, status, created_at")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}
