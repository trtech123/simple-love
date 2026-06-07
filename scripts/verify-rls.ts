/**
 * Executable RLS contract for launch safety.
 *
 * The script seeds throwaway auth users and dependent rows with the service-role
 * key, then queries through anon-key clients so Row Level Security is enforced.
 */
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd(), false, { info: () => undefined, error: console.error });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY");
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SERVER_ONLY_TABLES = [
  "payments",
  "payment_products",
  "registration_claim_tokens",
  "questionnaires",
  "questionnaire_versions",
  "questionnaire_blocks",
  "questions",
  "question_options",
  "prompt_versions",
  "archetypes",
  "archetype_versions",
  "match_settings",
  "match_settings_versions",
  "match_explanations",
  "matching_entitlements",
  "profile_form_configs",
  "profile_form_config_versions",
  "admin_audit_logs",
] as const;

type Check = { name: string; pass: boolean; detail: string };
type SeedUser = { id: string; email: string; password: string };
type SeedIds = Record<string, string>;

const checks: Check[] = [];

function record(name: string, pass: boolean, detail = "") {
  checks.push({ name, pass, detail });
}

async function rowCount(client: SupabaseClient, table: string, filter?: [string, string]) {
  let query = client.from(table).select("*", { count: "exact", head: true });
  if (filter) query = query.eq(filter[0], filter[1]);
  const { count, error } = await query;
  return { count: count ?? 0, error: error?.message ?? null };
}

async function selectRows(client: SupabaseClient, table: string, filter: [string, string]) {
  const { data, error } = await client.from(table).select("*").eq(filter[0], filter[1]);
  return { rows: data ?? [], error: error?.message ?? null };
}

async function expectInsertDenied(client: SupabaseClient, table: string, payload: Record<string, unknown>) {
  const { error } = await client.from(table).insert(payload);
  record(`direct write denied: ${table}`, Boolean(error), error ? error.message : "insert unexpectedly succeeded");
}

async function makeUser(tag: string): Promise<SeedUser> {
  const email = `rls-verify-${tag}-${Date.now()}-${randomUUID()}@example.invalid`;
  const password = "rls-verify-password-123";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return { id: data.user.id, email, password };
}

async function signedInClient(user: SeedUser) {
  const client = createClient(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw new Error(`signIn failed: ${error.message}`);
  return client;
}

async function insert(table: string, payload: Record<string, unknown>) {
  const { data, error } = await admin.from(table).insert(payload).select("*").single();
  if (error || !data) throw new Error(`seed ${table} failed: ${error?.message}`);
  return data as Record<string, unknown>;
}

async function seedFixture(userA: SeedUser, userB: SeedUser, userC: SeedUser): Promise<SeedIds> {
  const tag = `rls-${randomUUID()}`;
  const questionnaire = await insert("questionnaires", {
    slug: `${tag}-questionnaire`,
    title: "RLS Verify",
    purpose: "paid_report",
  });
  const questionnaireVersion = await insert("questionnaire_versions", {
    questionnaire_id: questionnaire.id,
    version: 1,
    status: "published",
  });
  const block = await insert("questionnaire_blocks", {
    questionnaire_version_id: questionnaireVersion.id,
    title: "Block",
    position: 1,
  });
  const question = await insert("questions", {
    questionnaire_block_id: block.id,
    stable_key: `${tag}-q1`,
    prompt: "Question",
    question_type: "open_text",
    position: 1,
  });
  const option = await insert("question_options", {
    question_id: question.id,
    label: "Option",
    value: tag,
    position: 1,
  });
  const prompt = await insert("prompt_versions", {
    slug: `${tag}-prompt`,
    version: 1,
    status: "published",
    template: "Template",
    model: "test",
  });
  const archetype = await insert("archetypes", { stable_key: `${tag}-archetype` });
  const archetypeVersion = await insert("archetype_versions", {
    archetype_id: archetype.id,
    version: 1,
    status: "published",
    name: "RLS",
    short_description: "RLS",
    full_description: "RLS",
    matching_meaning: "RLS",
  });
  const matchSettings = await insert("match_settings", { slug: `${tag}-settings` });
  const matchSettingsVersion = await insert("match_settings_versions", {
    match_settings_id: matchSettings.id,
    version: 1,
    status: "published",
    weights: {},
    hard_filters: {},
  });

  for (const user of [userA, userB, userC]) {
    await admin.from("profiles").upsert({ user_id: user.id, display_name: `RLS ${user.id.slice(0, 8)}` }, { onConflict: "user_id" });
  }

  const traitA = await insert("profile_traits", { user_id: userA.id, trait_key: `${tag}-trait-a`, numeric_value: 1 });
  const traitB = await insert("profile_traits", { user_id: userB.id, trait_key: `${tag}-trait-b`, numeric_value: 2 });
  const dealBreakerA = await insert("profile_deal_breakers", { user_id: userA.id, normalized_key: "smoking", label: "Smoking" });
  const dealBreakerB = await insert("profile_deal_breakers", { user_id: userB.id, normalized_key: "pets_mismatch", label: "Pets" });
  const quizA = await insert("quiz_sessions", {
    public_token: `${tag}-quiz-a`,
    user_id: userA.id,
    questionnaire_version_id: questionnaireVersion.id,
  });
  const quizB = await insert("quiz_sessions", {
    public_token: `${tag}-quiz-b`,
    user_id: userB.id,
    questionnaire_version_id: questionnaireVersion.id,
  });
  const answerA = await insert("quiz_answers", { quiz_session_id: quizA.id, question_id: question.id, text_answer: "A" });
  const answerB = await insert("quiz_answers", { quiz_session_id: quizB.id, question_id: question.id, text_answer: "B" });
  const reportA = await insert("reports", {
    quiz_session_id: quizA.id,
    user_id: userA.id,
    prompt_version_id: prompt.id,
    archetype_version_id: archetypeVersion.id,
    report_number: `${tag}-report-a`,
  });
  const reportB = await insert("reports", {
    quiz_session_id: quizB.id,
    user_id: userB.id,
    prompt_version_id: prompt.id,
    archetype_version_id: archetypeVersion.id,
    report_number: `${tag}-report-b`,
  });
  const artifactA = await insert("report_artifacts", {
    report_id: reportA.id,
    artifact_type: "pdf",
    storage_bucket: "rls",
    storage_path: `${tag}/a.pdf`,
  });
  const artifactB = await insert("report_artifacts", {
    report_id: reportB.id,
    artifact_type: "pdf",
    storage_bucket: "rls",
    storage_path: `${tag}/b.pdf`,
  });
  const payment = await insert("payments", {
    quiz_session_id: quizA.id,
    user_id: userA.id,
    product_key: "paid_report",
    provider: "rls",
    provider_reference: tag,
    amount_minor: 1,
  });
  const claimToken = await insert("registration_claim_tokens", {
    quiz_session_id: quizA.id,
    report_id: reportA.id,
    token_hash: `${tag}-token`,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
  const match = await insert("matches", {
    user_a: userA.id < userB.id ? userA.id : userB.id,
    user_b: userA.id < userB.id ? userB.id : userA.id,
    match_settings_version_id: matchSettingsVersion.id,
    score: 90,
  });
  const explanation = await insert("match_explanations", { match_id: match.id, explanation: { tag } });
  const conversation = await insert("conversations", { match_id: match.id });
  const messageA = await insert("messages", { conversation_id: conversation.id, sender_id: userA.id, body: "A" });
  const messageB = await insert("messages", { conversation_id: conversation.id, sender_id: userB.id, body: "B" });
  await insert("user_blocks", { blocker_id: userA.id, blocked_user_id: userB.id });
  await insert("user_blocks", { blocker_id: userB.id, blocked_user_id: userA.id });
  const audit = await insert("admin_audit_logs", {
    actor_user_id: userA.id,
    action: "rls.verify",
    target_table: "profiles",
    target_id: userA.id,
  });

  return {
    tag,
    questionnaireId: String(questionnaire.id),
    questionnaireVersionId: String(questionnaireVersion.id),
    blockId: String(block.id),
    questionId: String(question.id),
    optionId: String(option.id),
    promptId: String(prompt.id),
    archetypeId: String(archetype.id),
    archetypeVersionId: String(archetypeVersion.id),
    matchSettingsId: String(matchSettings.id),
    matchSettingsVersionId: String(matchSettingsVersion.id),
    traitAId: String(traitA.id),
    traitBId: String(traitB.id),
    dealBreakerAId: String(dealBreakerA.id),
    dealBreakerBId: String(dealBreakerB.id),
    quizAId: String(quizA.id),
    quizBId: String(quizB.id),
    answerAId: String(answerA.id),
    answerBId: String(answerB.id),
    reportAId: String(reportA.id),
    reportBId: String(reportB.id),
    artifactAId: String(artifactA.id),
    artifactBId: String(artifactB.id),
    paymentId: String(payment.id),
    claimTokenId: String(claimToken.id),
    matchId: String(match.id),
    explanationId: String(explanation.match_id),
    conversationId: String(conversation.id),
    messageAId: String(messageA.id),
    messageBId: String(messageB.id),
    auditId: String(audit.id),
  };
}

async function runChecks(ids: SeedIds, userA: SeedUser, userB: SeedUser, userC: SeedUser) {
  const clientA = await signedInClient(userA);
  const clientB = await signedInClient(userB);
  const clientC = await signedInClient(userC);
  const anon = createClient(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } });

  for (const [table, ownFilter, crossFilter] of [
    ["profiles", ["user_id", userA.id], ["user_id", userB.id]],
    ["profile_traits", ["id", ids.traitAId], ["id", ids.traitBId]],
    ["profile_deal_breakers", ["id", ids.dealBreakerAId], ["id", ids.dealBreakerBId]],
    ["reports", ["id", ids.reportAId], ["id", ids.reportBId]],
    ["report_artifacts", ["id", ids.artifactAId], ["id", ids.artifactBId]],
    ["quiz_sessions", ["id", ids.quizAId], ["id", ids.quizBId]],
    ["quiz_answers", ["id", ids.answerAId], ["id", ids.answerBId]],
  ] as [string, [string, string], [string, string]][]) {
    const own = await rowCount(clientA, table, ownFilter);
    record(`owner allowed: ${table}`, own.count === 1 && !own.error, `count=${own.count} err=${own.error}`);
    const cross = await rowCount(clientA, table, crossFilter);
    record(`cross-user denied: ${table}`, cross.count === 0, `leaked ${cross.count} row(s)`);
  }

  for (const table of ["matches", "conversations", "messages"]) {
    const participant = await rowCount(clientB, table);
    record(`participant allowed: ${table}`, participant.count >= 1 && !participant.error, `count=${participant.count} err=${participant.error}`);
    const nonparticipant = await rowCount(clientC, table);
    record(`nonparticipant denied: ${table}`, nonparticipant.count === 0, `leaked ${nonparticipant.count} row(s)`);
  }

  for (const table of SERVER_ONLY_TABLES) {
    const authed = await rowCount(clientA, table);
    record(`server-only hidden from authed: ${table}`, authed.count === 0, `leaked ${authed.count} row(s)`);
    const loggedOut = await rowCount(anon, table);
    record(`server-only hidden from anon: ${table}`, loggedOut.count === 0, `leaked ${loggedOut.count} row(s)`);
  }

  for (const table of ["profiles", "profile_traits", "profile_deal_breakers", "reports", "report_artifacts", "quiz_sessions", "quiz_answers", "matches", "conversations", "messages", "user_blocks"]) {
    const { count } = await rowCount(anon, table);
    record(`anon denied: ${table}`, count === 0, `leaked ${count} row(s)`);
  }

  const ownBlocks = await selectRows(clientA, "user_blocks", ["blocker_id", userA.id]);
  record("A sees only own user_blocks rows", ownBlocks.rows.length === 1, `saw ${ownBlocks.rows.length}`);
  const otherBlocks = await selectRows(clientA, "user_blocks", ["blocker_id", userB.id]);
  record("A cannot see B's user_blocks rows", otherBlocks.rows.length === 0, `leaked ${otherBlocks.rows.length}`);

  const { error: invalidBlockError } = await clientA.from("user_blocks").insert({ blocker_id: userB.id, blocked_user_id: userC.id });
  record("A cannot insert user_blocks for another blocker", Boolean(invalidBlockError), invalidBlockError?.message ?? "insert unexpectedly succeeded");

  const { error: ownBlockInsertError } = await clientA.from("user_blocks").insert({ blocker_id: userA.id, blocked_user_id: userC.id });
  record("A can insert own user_blocks row", !ownBlockInsertError, ownBlockInsertError?.message ?? "");
  const { error: ownBlockDeleteError } = await clientA
    .from("user_blocks")
    .delete()
    .eq("blocker_id", userA.id)
    .eq("blocked_user_id", userC.id);
  record("A can delete own user_blocks row", !ownBlockDeleteError, ownBlockDeleteError?.message ?? "");

  await expectInsertDenied(clientA, "admin_audit_logs", {
    actor_user_id: userA.id,
    action: "browser.insert",
    target_table: "profiles",
    target_id: userA.id,
  });
  await expectInsertDenied(clientA, "questionnaires", { slug: `${ids.tag}-browser`, title: "Browser", purpose: "paid_report" });
  await expectInsertDenied(clientA, "payment_products", {
    product_key: "paid_report",
    amount_minor: 1,
    currency: "ILS",
    item_name: "Browser",
    active: true,
  });
  await expectInsertDenied(clientA, "payments", {
    quiz_session_id: ids.quizAId,
    user_id: userA.id,
    product_key: "paid_report",
    provider: "browser",
    provider_reference: `${ids.tag}-browser-payment`,
    amount_minor: 1,
  });
}

async function cleanup(ids: Partial<SeedIds>, users: SeedUser[]) {
  const del = (table: string) => admin.from(table).delete();
  await del("admin_audit_logs").eq("id", ids.auditId ?? "");
  await del("user_blocks").in("blocker_id", users.map((user) => user.id));
  await del("messages").eq("conversation_id", ids.conversationId ?? "");
  await del("conversations").eq("id", ids.conversationId ?? "");
  await del("match_explanations").eq("match_id", ids.matchId ?? "");
  await del("matches").eq("id", ids.matchId ?? "");
  await del("registration_claim_tokens").eq("id", ids.claimTokenId ?? "");
  await del("payments").eq("id", ids.paymentId ?? "");
  await del("report_artifacts").in("id", [ids.artifactAId, ids.artifactBId].filter(Boolean));
  await del("reports").in("id", [ids.reportAId, ids.reportBId].filter(Boolean));
  await del("quiz_answers").in("id", [ids.answerAId, ids.answerBId].filter(Boolean));
  await del("quiz_sessions").in("id", [ids.quizAId, ids.quizBId].filter(Boolean));
  await del("profile_deal_breakers").in("id", [ids.dealBreakerAId, ids.dealBreakerBId].filter(Boolean));
  await del("profile_traits").in("id", [ids.traitAId, ids.traitBId].filter(Boolean));
  await del("profiles").in("user_id", users.map((user) => user.id));
  await del("match_settings_versions").eq("id", ids.matchSettingsVersionId ?? "");
  await del("match_settings").eq("id", ids.matchSettingsId ?? "");
  await del("archetype_versions").eq("id", ids.archetypeVersionId ?? "");
  await del("archetypes").eq("id", ids.archetypeId ?? "");
  await del("prompt_versions").eq("id", ids.promptId ?? "");
  await del("question_options").eq("id", ids.optionId ?? "");
  await del("questions").eq("id", ids.questionId ?? "");
  await del("questionnaire_blocks").eq("id", ids.blockId ?? "");
  await del("questionnaire_versions").eq("id", ids.questionnaireVersionId ?? "");
  await del("questionnaires").eq("id", ids.questionnaireId ?? "");
  await Promise.all(users.map((user) => admin.auth.admin.deleteUser(user.id).catch(() => undefined)));
}

/**
 * Defensively remove fixtures left behind by interrupted prior runs.
 *
 * The per-run cleanup() deletes by captured ids in a finally block, which never
 * runs if the process is hard-killed mid-checks. This sweep finds any leftover
 * `rls-%` questionnaires and tears down their dependency tree in FK order before
 * a fresh run seeds new fixtures, keeping the shared DB self-healing.
 */
async function sweepLeftovers() {
  const { data: questionnaires } = await admin.from("questionnaires").select("id").like("slug", "rls-%");
  const qIds = (questionnaires ?? []).map((row) => String(row.id));
  if (qIds.length === 0) return;

  const { data: versions } = await admin.from("questionnaire_versions").select("id").in("questionnaire_id", qIds);
  const vIds = (versions ?? []).map((row) => String(row.id));

  const { data: quizzes } = vIds.length
    ? await admin.from("quiz_sessions").select("id").in("questionnaire_version_id", vIds)
    : { data: [] };
  const quizIds = (quizzes ?? []).map((row) => String(row.id));

  const { data: reports } = quizIds.length
    ? await admin.from("reports").select("id").in("quiz_session_id", quizIds)
    : { data: [] };
  const reportIds = (reports ?? []).map((row) => String(row.id));

  // Delete in dependency order; cascades handle blocks/questions/options,
  // quiz_answers, and report_artifacts.
  if (quizIds.length) await admin.from("registration_claim_tokens").delete().in("quiz_session_id", quizIds);
  if (reportIds.length) await admin.from("registration_claim_tokens").delete().in("report_id", reportIds);
  if (quizIds.length) await admin.from("payments").delete().in("quiz_session_id", quizIds);
  if (reportIds.length) await admin.from("reports").delete().in("id", reportIds);
  if (quizIds.length) await admin.from("quiz_sessions").delete().in("id", quizIds);
  if (vIds.length) await admin.from("questionnaire_versions").delete().in("id", vIds);
  await admin.from("questionnaires").delete().in("id", qIds);
  console.log(`Swept ${qIds.length} leftover rls- questionnaire fixture(s) from a prior interrupted run.`);
}

async function main() {
  await sweepLeftovers();

  const users = [await makeUser("a"), await makeUser("b"), await makeUser("c")];
  let ids: Partial<SeedIds> = {};

  // finally only runs on normal completion/throw; a hard kill skips it. Run
  // cleanup on termination signals too so an interrupted run doesn't leak.
  let cleanedUp = false;
  const runCleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    await cleanup(ids, users);
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      runCleanup()
        .catch((error) => console.error(`cleanup on ${signal} failed:`, error))
        .finally(() => process.exit(130));
    });
  }

  try {
    ids = await seedFixture(users[0], users[1], users[2]);
    await runChecks(ids as SeedIds, users[0], users[1], users[2]);
  } finally {
    await runCleanup();
  }

  const failures = checks.filter((check) => !check.pass);
  for (const check of checks) {
    console.log(`${check.pass ? "PASS" : "FAIL"}  ${check.name}${check.detail ? ` - ${check.detail}` : ""}`);
  }
  console.log(`\n${checks.length - failures.length}/${checks.length} checks passed.`);
  if (failures.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
