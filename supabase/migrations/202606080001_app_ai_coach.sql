create table if not exists public.ai_coach_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_coach_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ai_coach_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_coach_soft_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  trait_key text not null check (
    trait_key in (
      'emotional_profile',
      'communication_style',
      'commitment_readiness',
      'relationship_vision',
      'visual_taste'
    )
  ),
  delta numeric not null check (delta between -15 and 15),
  rationale text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_coach_hard_filter_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  thread_id uuid references public.ai_coach_threads(id) on delete set null,
  field text not null check (
    field in (
      'preferredAgeMin',
      'preferredAgeMax',
      'preferredDistanceKm',
      'relationshipIntention',
      'dealBreakers'
    )
  ),
  value jsonb not null,
  rationale text,
  status text not null default 'pending' check (status in ('pending', 'applied', 'dismissed')),
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_coach_threads enable row level security;
alter table public.ai_coach_messages enable row level security;
alter table public.ai_coach_soft_signals enable row level security;
alter table public.ai_coach_hard_filter_suggestions enable row level security;

drop policy if exists "ai coach threads owner select" on public.ai_coach_threads;
create policy "ai coach threads owner select"
  on public.ai_coach_threads for select
  using (auth.uid() = user_id);

drop policy if exists "ai coach messages owner select" on public.ai_coach_messages;
create policy "ai coach messages owner select"
  on public.ai_coach_messages for select
  using (
    exists (
      select 1 from public.ai_coach_threads t
      where t.id = thread_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "ai coach signals owner select" on public.ai_coach_soft_signals;
create policy "ai coach signals owner select"
  on public.ai_coach_soft_signals for select
  using (auth.uid() = user_id);

drop policy if exists "ai coach suggestions owner select" on public.ai_coach_hard_filter_suggestions;
create policy "ai coach suggestions owner select"
  on public.ai_coach_hard_filter_suggestions for select
  using (auth.uid() = user_id);

create index if not exists ai_coach_threads_user_status_idx on public.ai_coach_threads(user_id, status);
create index if not exists ai_coach_messages_thread_created_idx on public.ai_coach_messages(thread_id, created_at);
create index if not exists ai_coach_soft_signals_user_status_idx on public.ai_coach_soft_signals(user_id, status);
create index if not exists ai_coach_suggestions_user_status_idx on public.ai_coach_hard_filter_suggestions(user_id, status);

create or replace function public.save_matching_profile(
  p_user_id uuid,
  p_display_name text,
  p_birth_year integer,
  p_preferred_age_min integer,
  p_preferred_age_max integer,
  p_gender text,
  p_interested_in text,
  p_location_text text,
  p_location_latitude numeric,
  p_location_longitude numeric,
  p_location_geocoded_at timestamptz,
  p_preferred_distance_km integer,
  p_relationship_intention text,
  p_deal_breakers jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    display_name = p_display_name,
    birth_year = p_birth_year,
    preferred_age_min = p_preferred_age_min,
    preferred_age_max = p_preferred_age_max,
    gender = p_gender,
    interested_in = p_interested_in,
    location_text = p_location_text,
    location_latitude = p_location_latitude,
    location_longitude = p_location_longitude,
    location_geocoded_at = p_location_geocoded_at,
    preferred_distance_km = p_preferred_distance_km,
    relationship_intention = p_relationship_intention,
    updated_at = now()
  where user_id = p_user_id;

  delete from public.profile_deal_breakers
  where user_id = p_user_id;

  insert into public.profile_deal_breakers (
    user_id,
    label,
    normalized_key,
    other_text,
    created_at,
    updated_at
  )
  select
    p_user_id,
    item ->> 'label',
    item ->> 'key',
    nullif(item ->> 'otherText', ''),
    now(),
    now()
  from jsonb_array_elements(coalesce(p_deal_breakers, '[]'::jsonb)) as item
  where item ->> 'key' is not null
    and item ->> 'label' is not null;
end;
$$;

grant execute on function public.save_matching_profile(
  uuid,
  text,
  integer,
  integer,
  integer,
  text,
  text,
  text,
  numeric,
  numeric,
  timestamptz,
  integer,
  text,
  jsonb
) to authenticated, service_role;
