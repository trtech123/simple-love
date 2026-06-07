/**
 * Gated Supabase Realtime verification for chat messages.
 *
 * Usage:
 *   RUN_SUPABASE_INTEGRATION=1 npx tsx scripts/verify-realtime-chat.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The script
 * creates temporary users/profiles/match/conversation rows, subscribes to
 * INSERT events on public.messages, inserts one message, verifies websocket
 * delivery, then cleans up.
 */
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd(), false, { info: () => undefined, error: console.error });

if (process.env.RUN_SUPABASE_INTEGRATION !== "1") {
  console.log("Skipping Supabase Realtime verification. Set RUN_SUPABASE_INTEGRATION=1 to run it.");
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.log("Skipping Supabase Realtime verification. Missing Supabase URL or service role key.");
  process.exit(0);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type TempUser = {
  id: string;
  email: string;
};

async function createTempUser(tag: string): Promise<TempUser> {
  const email = `realtime-chat-${tag}-${Date.now()}@example.invalid`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: "realtime-chat-password-123",
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`createUser failed: ${error?.message ?? "missing user"}`);
  }

  return { id: data.user.id, email };
}

async function main() {
  const userA = await createTempUser("a");
  const userB = await createTempUser("b");
  const created = {
    matchId: null as string | null,
    conversationId: null as string | null,
    messageId: null as string | null,
    settingsId: null as string | null,
    settingsVersionId: null as string | null,
  };

  try {
    await insertProfile(userA.id, "Realtime A");
    await insertProfile(userB.id, "Realtime B");

    const { data: settings, error: settingsError } = await supabase
      .from("match_settings")
      .insert({ slug: `realtime-chat-${Date.now()}` })
      .select("id")
      .single<{ id: string }>();
    if (settingsError || !settings) throw new Error(`settings insert failed: ${settingsError?.message}`);
    created.settingsId = settings.id;

    const { data: version, error: versionError } = await supabase
      .from("match_settings_versions")
      .insert({
        match_settings_id: settings.id,
        version: 1,
        status: "published",
        weights: {},
        hard_filters: {},
        published_at: new Date().toISOString(),
      })
      .select("id")
      .single<{ id: string }>();
    if (versionError || !version) throw new Error(`settings version insert failed: ${versionError?.message}`);
    created.settingsVersionId = version.id;

    const [user_a, user_b] = [userA.id, userB.id].sort();
    const { data: match, error: matchError } = await supabase
      .from("matches")
      .insert({
        user_a,
        user_b,
        match_settings_version_id: version.id,
        score: 100,
        status: "active",
      })
      .select("id")
      .single<{ id: string }>();
    if (matchError || !match) throw new Error(`match insert failed: ${matchError?.message}`);
    created.matchId = match.id;

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .insert({ match_id: match.id })
      .select("id")
      .single<{ id: string }>();
    if (conversationError || !conversation) {
      throw new Error(`conversation insert failed: ${conversationError?.message}`);
    }
    created.conversationId = conversation.id;

    const realtime = waitForMessage(conversation.id);
    await realtime.subscribed;

    const { data: message, error: messageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversation.id,
        sender_id: userA.id,
        body: "Realtime verification message",
      })
      .select("id")
      .single<{ id: string }>();
    if (messageError || !message) throw new Error(`message insert failed: ${messageError?.message}`);
    created.messageId = message.id;

    const deliveredMessageId = await realtime.delivered;
    if (deliveredMessageId !== message.id) {
      throw new Error(`Realtime delivered ${deliveredMessageId}, expected ${message.id}`);
    }

    console.log("PASS Supabase Realtime delivered inserted chat message.");
  } finally {
    await cleanup(created, userA, userB);
  }
}

async function insertProfile(userId: string, displayName: string) {
  const { error } = await supabase.from("profiles").insert({ user_id: userId, display_name: displayName });
  if (error) {
    throw new Error(`profile insert failed: ${error.message}`);
  }
}

function waitForMessage(conversationId: string) {
  let resolveSubscribed: (() => void) | null = null;
  let rejectSubscribed: ((error: Error) => void) | null = null;
  let resolveDelivered: ((messageId: string) => void) | null = null;
  let rejectDelivered: ((error: Error) => void) | null = null;
  let isSubscribed = false;

  const channel = supabase.channel(`verify-realtime-chat:${conversationId}`);
  const timeoutId = setTimeout(() => {
    const error = new Error("Timed out waiting for Realtime message delivery");
    if (isSubscribed) {
      rejectDelivered?.(error);
    } else {
      rejectSubscribed?.(error);
    }
    void supabase.removeChannel(channel);
  }, 15000);

  const subscribed = new Promise<void>((resolve, reject) => {
    resolveSubscribed = resolve;
    rejectSubscribed = reject;
  });
  const delivered = new Promise<string>((resolve, reject) => {
    resolveDelivered = resolve;
    rejectDelivered = reject;
  });

  channel
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const row = payload.new as { id?: string };
        if (row.id) {
          clearTimeout(timeoutId);
          void supabase.removeChannel(channel);
          resolveDelivered?.(row.id);
        }
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        isSubscribed = true;
        resolveSubscribed?.();
        return;
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        const error = new Error(`Realtime subscription failed: ${status}`);
        clearTimeout(timeoutId);
        void supabase.removeChannel(channel);
        if (isSubscribed) {
          rejectDelivered?.(error);
        } else {
          rejectSubscribed?.(error);
        }
      }
    });

  return { subscribed, delivered };
}

async function cleanup(
  created: {
    matchId: string | null;
    conversationId: string | null;
    messageId: string | null;
    settingsId: string | null;
    settingsVersionId: string | null;
  },
  userA: TempUser,
  userB: TempUser,
) {
  if (created.messageId) await supabase.from("messages").delete().eq("id", created.messageId);
  if (created.conversationId) await supabase.from("conversations").delete().eq("id", created.conversationId);
  if (created.matchId) await supabase.from("matches").delete().eq("id", created.matchId);
  if (created.settingsVersionId) await supabase.from("match_settings_versions").delete().eq("id", created.settingsVersionId);
  if (created.settingsId) await supabase.from("match_settings").delete().eq("id", created.settingsId);
  await supabase.from("profiles").delete().in("user_id", [userA.id, userB.id]);
  await supabase.auth.admin.deleteUser(userA.id).catch(() => undefined);
  await supabase.auth.admin.deleteUser(userB.id).catch(() => undefined);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
