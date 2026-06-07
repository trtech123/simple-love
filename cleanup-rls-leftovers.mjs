import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const APPLY = process.argv.includes("--apply");

async function ids(table, sel, col, vals) {
  if (!vals.length) return [];
  const { data, error } = await admin.from(table).select(sel).in(col, vals);
  if (error) throw new Error(`read ${table}: ${error.message}`);
  return data;
}
async function del(table, col, vals, label) {
  if (!vals.length) return;
  const { error, count } = await admin.from(table).delete({ count: "exact" }).in(col, vals);
  if (error) throw new Error(`delete ${table}: ${error.message}`);
  console.log(`  deleted ${count} ${label ?? table}`);
}

// 1. leftover test questionnaires
const { data: qRows, error: qErr } = await admin
  .from("questionnaires")
  .select("id, slug, title, created_at")
  .like("slug", "rls-%")
  .order("created_at", { ascending: true });
if (qErr) throw qErr;
console.log(`Found ${qRows.length} leftover test questionnaire(s):`);
for (const q of qRows) console.log(`  ${q.created_at}  slug=${q.slug}  title=${q.title}`);
if (qRows.length === 0) { console.log("Nothing to clean up."); process.exit(0); }
const qIds = qRows.map((q) => q.id);

// 2. versions of those questionnaires
const vIds = (await ids("questionnaire_versions", "id", "questionnaire_id", qIds)).map((r) => r.id);
// 3. quiz_sessions referencing those versions
const quizIds = (await ids("quiz_sessions", "id", "questionnaire_version_id", vIds)).map((r) => r.id);
// 4. reports referencing those quiz_sessions
const reportIds = (await ids("reports", "id", "quiz_session_id", quizIds)).map((r) => r.id);

console.log(`\nDependency tree: ${vIds.length} version(s), ${quizIds.length} quiz_session(s), ${reportIds.length} report(s).`);

if (!APPLY) {
  console.log("\nDRY RUN. Re-run with --apply.");
  console.log("Delete order: registration_claim_tokens, payments, report_artifacts(cascade), reports,");
  console.log("  quiz_answers(cascade w/ quiz_sessions), quiz_sessions, questionnaire_versions(cascade), questionnaires.");
  process.exit(0);
}

console.log("\nDeleting in dependency order:");
// registration_claim_tokens references quiz_session_id AND report_id (no cascade)
await del("registration_claim_tokens", "quiz_session_id", quizIds, "registration_claim_tokens (by quiz)");
await del("registration_claim_tokens", "report_id", reportIds, "registration_claim_tokens (by report)");
// payments reference quiz_session_id (no cascade)
await del("payments", "quiz_session_id", quizIds, "payments");
// report_artifacts cascade from reports; reports cascade nothing upward -> delete reports (artifacts cascade)
await del("reports", "id", reportIds, "reports (artifacts cascade)");
// quiz_answers cascade from quiz_sessions -> deleting quiz_sessions removes answers
await del("quiz_sessions", "id", quizIds, "quiz_sessions (answers cascade)");
// versions cascade blocks->questions->options
await del("questionnaire_versions", "id", vIds, "questionnaire_versions (blocks/questions/options cascade)");
await del("questionnaires", "id", qIds, "questionnaires");
console.log("Done.");
