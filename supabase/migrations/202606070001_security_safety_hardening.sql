alter table public.questionnaires enable row level security;
alter table public.questionnaire_versions enable row level security;
alter table public.questionnaire_blocks enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.quiz_sessions enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.payments enable row level security;
alter table public.payment_products enable row level security;
alter table public.prompt_versions enable row level security;
alter table public.archetypes enable row level security;
alter table public.archetype_versions enable row level security;
alter table public.reports enable row level security;
alter table public.report_artifacts enable row level security;
alter table public.registration_claim_tokens enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_traits enable row level security;
alter table public.profile_deal_breakers enable row level security;
alter table public.profile_form_configs enable row level security;
alter table public.profile_form_config_versions enable row level security;
alter table public.match_settings enable row level security;
alter table public.match_settings_versions enable row level security;
alter table public.matching_entitlements enable row level security;
alter table public.matches enable row level security;
alter table public.match_explanations enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.user_reports enable row level security;
alter table public.user_blocks enable row level security;
alter table public.admin_audit_logs enable row level security;

do $$
declare
  server_only_table regclass;
  existing_policy text;
begin
  foreach server_only_table in array array[
    'public.payments'::regclass,
    'public.payment_products'::regclass,
    'public.registration_claim_tokens'::regclass,
    'public.questionnaires'::regclass,
    'public.questionnaire_versions'::regclass,
    'public.questionnaire_blocks'::regclass,
    'public.questions'::regclass,
    'public.question_options'::regclass,
    'public.prompt_versions'::regclass,
    'public.archetypes'::regclass,
    'public.archetype_versions'::regclass,
    'public.match_settings'::regclass,
    'public.match_settings_versions'::regclass,
    'public.match_explanations'::regclass,
    'public.matching_entitlements'::regclass,
    'public.profile_form_configs'::regclass,
    'public.profile_form_config_versions'::regclass,
    'public.admin_audit_logs'::regclass
  ]
  loop
    for existing_policy in
      select polname from pg_policy where polrelid = server_only_table
    loop
      execute format('drop policy if exists %I on %s', existing_policy, server_only_table);
    end loop;
  end loop;
end $$;

drop policy if exists profiles_owner_select on public.profiles;
create policy profiles_owner_select
on public.profiles
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update
on public.profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists profile_traits_owner_select on public.profile_traits;
create policy profile_traits_owner_select
on public.profile_traits
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists profile_deal_breakers_owner_select on public.profile_deal_breakers;
create policy profile_deal_breakers_owner_select
on public.profile_deal_breakers
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists reports_owner_select on public.reports;
create policy reports_owner_select
on public.reports
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists report_artifacts_owner_select on public.report_artifacts;
create policy report_artifacts_owner_select
on public.report_artifacts
for select
to authenticated
using (
  exists (
    select 1
    from public.reports
    where reports.id = report_artifacts.report_id
      and reports.user_id = auth.uid()
  )
);

drop policy if exists quiz_sessions_owner_select on public.quiz_sessions;
create policy quiz_sessions_owner_select
on public.quiz_sessions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists quiz_answers_owner_select on public.quiz_answers;
create policy quiz_answers_owner_select
on public.quiz_answers
for select
to authenticated
using (
  exists (
    select 1
    from public.quiz_sessions
    where quiz_sessions.id = quiz_answers.quiz_session_id
      and quiz_sessions.user_id = auth.uid()
  )
);

drop policy if exists matches_participant_select on public.matches;
create policy matches_participant_select
on public.matches
for select
to authenticated
using (user_a = auth.uid() or user_b = auth.uid());

drop policy if exists conversations_participant_select on public.conversations;
create policy conversations_participant_select
on public.conversations
for select
to authenticated
using (
  exists (
    select 1
    from public.matches
    where matches.id = conversations.match_id
      and (matches.user_a = auth.uid() or matches.user_b = auth.uid())
  )
);

drop policy if exists messages_participant_select on public.messages;
create policy messages_participant_select
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.conversations
    join public.matches on matches.id = conversations.match_id
    where conversations.id = messages.conversation_id
      and (matches.user_a = auth.uid() or matches.user_b = auth.uid())
  )
);

drop policy if exists user_reports_participant_insert on public.user_reports;
create policy user_reports_participant_insert
on public.user_reports
for insert
to authenticated
with check (
  reporter_id = auth.uid()
  and exists (
    select 1
    from public.conversations
    join public.matches on matches.id = conversations.match_id
    where conversations.id = user_reports.conversation_id
      and reported_user_id in (matches.user_a, matches.user_b)
      and reported_user_id <> auth.uid()
      and (matches.user_a = auth.uid() or matches.user_b = auth.uid())
  )
);

drop policy if exists user_blocks_owner_select on public.user_blocks;
create policy user_blocks_owner_select
on public.user_blocks
for select
to authenticated
using (blocker_id = auth.uid());

drop policy if exists user_blocks_owner_insert on public.user_blocks;
create policy user_blocks_owner_insert
on public.user_blocks
for insert
to authenticated
with check (blocker_id = auth.uid() and blocked_user_id <> auth.uid());

drop policy if exists user_blocks_owner_delete on public.user_blocks;
create policy user_blocks_owner_delete
on public.user_blocks
for delete
to authenticated
using (blocker_id = auth.uid());
