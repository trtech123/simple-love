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

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
