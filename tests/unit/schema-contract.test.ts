import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

function policyBlock(sql: string, policyName: string) {
  const match = sql.match(new RegExp(`create policy ${policyName}[\\s\\S]*?;`, "i"));
  return match?.[0] ?? "";
}

const migrationPaths = readdirSync("supabase/migrations")
  .filter((path) => path.endsWith(".sql"))
  .sort()
  .map((path) => `supabase/migrations/${path}`);

const allMigrationSql = migrationPaths.map((path) => readFileSync(path, "utf8")).join("\n");

describe("foundation migration", () => {
  const sql = readFileSync("supabase/migrations/202606010001_foundation.sql", "utf8");

  it("creates the core tables required by the design", () => {
    for (const table of [
      "questionnaires",
      "questionnaire_versions",
      "quiz_sessions",
      "payments",
      "reports",
      "report_artifacts",
      "registration_claim_tokens",
      "profiles",
      "profile_traits",
      "matches",
      "conversations",
      "messages",
      "user_reports",
      "user_blocks",
      "admin_audit_logs",
    ]) {
      expect(sql).toContain(`create table public.${table}`);
    }
  });

  it("enables row level security on sensitive tables", () => {
    expect(sql).toContain("alter table public.profiles enable row level security");
    expect(sql).toContain("alter table public.messages enable row level security");
    expect(sql).toContain("alter table public.reports enable row level security");
    expect(sql).toContain("alter table public.report_artifacts enable row level security");
  });
});

describe("matching profile preferences migration", () => {
  const sql = readFileSync("supabase/migrations/202606020002_matching_profile_preferences.sql", "utf8");

  it("adds required matching preference fields and deal breakers", () => {
    expect(sql).toContain("preferred_age_min");
    expect(sql).toContain("preferred_age_max");
    expect(sql).toContain("location_latitude");
    expect(sql).toContain("location_longitude");
    expect(sql).toContain("location_geocoded_at");
    expect(sql).toContain("preferred_distance_km");
    expect(sql).toContain("create table if not exists public.profile_deal_breakers");
    expect(sql).toContain("other_text");
    expect(sql).toContain("unique (user_id, normalized_key)");
    expect(sql).toContain("create or replace function public.save_matching_profile");
    expect(sql).toContain("delete from public.profile_deal_breakers");
  });
});

describe("chat access migration", () => {
  const sql = readFileSync("supabase/migrations/202606020001_chat_access.sql", "utf8");

  it("adds participant-only policies for chat reads and reports", () => {
    expect(sql).toContain("create policy conversations_participant_select");
    expect(sql).toContain("create policy messages_participant_select");
    expect(sql).toContain("create policy user_reports_participant_insert");
    expect(sql).toContain("auth.uid()");
  });

  it("publishes messages to Supabase Realtime", () => {
    expect(sql).toContain("alter publication supabase_realtime add table public.messages");
  });
});

describe("RLS security audit migration", () => {
  const sql = readFileSync("supabase/migrations/202606030001_rls_security_audit.sql", "utf8");

  it("keeps RLS enabled for all sensitive user, payment, report, chat, moderation, and admin tables", () => {
    for (const table of [
      "questionnaires",
      "questionnaire_versions",
      "questionnaire_blocks",
      "questions",
      "question_options",
      "quiz_sessions",
      "quiz_answers",
      "payments",
      "prompt_versions",
      "archetypes",
      "archetype_versions",
      "reports",
      "report_artifacts",
      "registration_claim_tokens",
      "profiles",
      "profile_traits",
      "profile_deal_breakers",
      "match_settings",
      "match_settings_versions",
      "matches",
      "match_explanations",
      "payment_products",
      "matching_entitlements",
      "conversations",
      "messages",
      "user_reports",
      "user_blocks",
      "admin_audit_logs",
      "profile_form_configs",
      "profile_form_config_versions",
    ]) {
      expect(allMigrationSql).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("adds explicit owner and participant read policies for browser-safe tables", () => {
    for (const policy of [
      "profiles_owner_select",
      "profiles_owner_update",
      "profile_traits_owner_select",
      "profile_deal_breakers_owner_select",
      "matches_participant_select",
      "conversations_participant_select",
      "messages_participant_select",
      "user_blocks_owner_select",
      "user_blocks_owner_insert",
      "user_blocks_owner_delete",
      "reports_owner_select",
      "report_artifacts_owner_select",
      "quiz_sessions_owner_select",
      "quiz_answers_owner_select",
    ]) {
      expect(sql).toContain(`create policy ${policy}`);
    }
  });

  it("uses auth.uid in every owner and participant policy", () => {
    for (const policy of [
      "profiles_owner_select",
      "profiles_owner_update",
      "profile_traits_owner_select",
      "profile_deal_breakers_owner_select",
      "matches_participant_select",
      "conversations_participant_select",
      "messages_participant_select",
      "user_blocks_owner_select",
      "user_blocks_owner_insert",
      "user_blocks_owner_delete",
      "reports_owner_select",
      "report_artifacts_owner_select",
      "quiz_sessions_owner_select",
      "quiz_answers_owner_select",
    ]) {
      expect(policyBlock(sql, policy)).toContain("auth.uid()");
    }
  });

  it("revokes direct browser execution of the matching profile RPC", () => {
    const saveMatchingProfileGrants = sql
      .split(";")
      .filter((statement) => /grant execute on function public\.save_matching_profile/i.test(statement));

    expect(sql).toContain("revoke execute on function public.save_matching_profile");
    expect(sql).toContain("from authenticated");
    expect(sql).toContain("from public");
    expect(saveMatchingProfileGrants).toHaveLength(1);
    expect(saveMatchingProfileGrants[0]).toContain("to service_role");
    expect(saveMatchingProfileGrants[0]).not.toContain("authenticated");
  });

  it("does not add browser policies for server-only tables", () => {
    for (const table of [
      "payments",
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
      "payment_products",
      "matching_entitlements",
      "profile_form_configs",
      "profile_form_config_versions",
      "admin_audit_logs",
    ]) {
      expect(sql).not.toMatch(new RegExp(`create policy [\\s\\S]*? on public\\.${table}\\b`, "i"));
    }
  });
});

describe("profile form config migration", () => {
  const sql = readFileSync("supabase/migrations/202606060002_profile_form_config.sql", "utf8");

  it("creates versioned profile form config tables and seeds the default published version", () => {
    expect(sql).toContain("create table if not exists public.profile_form_configs");
    expect(sql).toContain("create table if not exists public.profile_form_config_versions");
    expect(sql).toContain("slug = 'default'");
    expect(sql).toContain('"direction": "rtl"');
    expect(sql).toContain('"label": "אישה"');
    expect(sql).toContain("'published'");
  });
});

describe("two-stage payments migration", () => {
  const sql = readFileSync("supabase/migrations/202606060001_two_stage_payments.sql", "utf8");

  it("adds managed payment products and matching unlock payment ownership", () => {
    expect(sql).toContain("create table if not exists public.payment_products");
    expect(sql).toContain("add column if not exists product_key");
    expect(sql).toContain("add column if not exists user_id");
    expect(sql).toContain("create table if not exists public.matching_entitlements");
  });
});

describe("security safety launch hardening migration", () => {
  const sql = readFileSync("supabase/migrations/202606070001_security_safety_hardening.sql", "utf8");

  it("keeps browser-safe owner and participant policies explicit", () => {
    for (const policy of [
      "profiles_owner_select",
      "profile_traits_owner_select",
      "profile_deal_breakers_owner_select",
      "reports_owner_select",
      "report_artifacts_owner_select",
      "quiz_sessions_owner_select",
      "quiz_answers_owner_select",
      "matches_participant_select",
      "conversations_participant_select",
      "messages_participant_select",
      "user_blocks_owner_select",
      "user_blocks_owner_insert",
      "user_blocks_owner_delete",
    ]) {
      expect(sql).toContain(`create policy ${policy}`);
      expect(policyBlock(sql, policy)).toContain("auth.uid()");
    }
  });

  it("does not grant browser policies to server-mediated tables", () => {
    for (const table of [
      "payments",
      "registration_claim_tokens",
      "questionnaires",
      "questionnaire_versions",
      "questions",
      "question_options",
      "prompt_versions",
      "archetypes",
      "archetype_versions",
      "match_settings",
      "match_settings_versions",
      "match_explanations",
      "payment_products",
      "matching_entitlements",
      "admin_audit_logs",
    ]) {
      expect(sql).not.toMatch(new RegExp(`create policy [\\s\\S]*? on public\\.${table}\\b`, "i"));
    }
  });
});
