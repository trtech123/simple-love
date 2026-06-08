import { apiError, apiSuccess } from "@/app/api/envelope";
import { requireAuthenticatedUserId } from "@/app/api/matching/auth";
import { neutralTuningOutput, parseAiCoachTuningOutput } from "@/domain/ai-coach/tuning";
import { loadMatchProfiles, rerunMatchesForUser } from "@/domain/matching/rerun";
import { loadPublishedMatchSettings } from "@/domain/matching/settings-repository";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userId = await requireAuthenticatedUserId();
  if (!userId) {
    return apiError({ status: 401, code: "authentication_required", message: "צריך להתחבר כדי להמשיך." });
  }

  const body = (await request.json().catch(() => null)) as { message?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return apiError({ status: 400, code: "message_required", message: "צריך לכתוב הודעה למאמנת." });
  }

  const supabase = createServiceRoleClient();
  const thread = await ensureActiveThread(supabase, userId);

  const userMessage = await insertMessage(supabase, thread.id, "user", message);
  const tuning = await generateCoachTuning(message);
  const assistantMessage = await insertMessage(supabase, thread.id, "assistant", tuning.reply);

  await persistSoftSignals(supabase, userId, tuning.softSignals);
  await persistHardFilterSuggestions(supabase, userId, thread.id, tuning.hardFilterSuggestions);
  await rerunUserMatchesIfPossible(supabase, userId);

  return apiSuccess({
    thread,
    messages: [userMessage, assistantMessage],
    softSignals: tuning.softSignals,
    suggestions: tuning.hardFilterSuggestions,
  });
}

async function generateCoachTuning(message: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return neutralTuningOutput("קיבלתי. אשמור את זה כשיחה, וכשנעמיק אוכל לכוון את ההתאמות הרכות בלי לשנות סינונים קשיחים לבד.");
  }

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a Hebrew dating coach. Return JSON with reply, softSignals, hardFilterSuggestions. Soft signals use traitKey and delta -15..15 only. Never apply hard filters silently.",
        },
        { role: "user", content: message },
      ],
    });

    const content = response.choices[0]?.message.content;
    return parseAiCoachTuningOutput(content ? JSON.parse(content) : null);
  } catch {
    return neutralTuningOutput("קיבלתי. כרגע אשמור את השיחה בלי לשנות את ההתאמות.");
  }
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

  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data;

  const created = await supabase
    .from("ai_coach_threads")
    .insert({ user_id: userId, status: "active" })
    .select("id, user_id, status, created_at, updated_at")
    .single();

  if (created.error || !created.data) throw new Error(created.error?.message ?? "Could not create AI coach thread");
  return created.data;
}

async function insertMessage(
  supabase: ReturnType<typeof createServiceRoleClient>,
  threadId: string,
  role: "user" | "assistant",
  content: string,
) {
  const { data, error } = await supabase
    .from("ai_coach_messages")
    .insert({ thread_id: threadId, role, content })
    .select("id, role, content, created_at")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Could not store AI coach message");
  return data;
}

async function persistSoftSignals(
  supabase: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  signals: Array<{ traitKey: string; delta: number; rationale?: string }>,
) {
  for (const signal of signals) {
    const { error } = await supabase.from("ai_coach_soft_signals").insert({
      user_id: userId,
      trait_key: signal.traitKey,
      delta: signal.delta,
      rationale: signal.rationale ?? null,
      status: "active",
    });
    if (error) throw new Error(error.message);
  }
}

async function persistHardFilterSuggestions(
  supabase: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  threadId: string,
  suggestions: Array<{ field: string; value: unknown; rationale?: string }>,
) {
  for (const suggestion of suggestions) {
    const { error } = await supabase.from("ai_coach_hard_filter_suggestions").insert({
      user_id: userId,
      thread_id: threadId,
      field: suggestion.field,
      value: suggestion.value,
      rationale: suggestion.rationale ?? null,
      status: "pending",
    });
    if (error) throw new Error(error.message);
  }
}

async function rerunUserMatchesIfPossible(supabase: ReturnType<typeof createServiceRoleClient>, userId: string) {
  try {
    const [settings, profiles] = await Promise.all([
      loadPublishedMatchSettings(supabase),
      loadMatchProfiles(supabase),
    ]);
    await rerunMatchesForUser({ supabase, userId, settings, profiles });
  } catch {
    // Coach messages should remain usable even if local schema or match settings are not ready.
  }
}
