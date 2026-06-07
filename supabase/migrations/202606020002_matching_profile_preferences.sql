alter table public.profiles
  add column if not exists preferred_age_min integer,
  add column if not exists preferred_age_max integer,
  add column if not exists location_latitude numeric,
  add column if not exists location_longitude numeric,
  add column if not exists location_geocoded_at timestamptz,
  add column if not exists preferred_distance_km integer not null default 50;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_preferred_distance_km_check'
  ) then
    alter table public.profiles
      add constraint profiles_preferred_distance_km_check
      check (preferred_distance_km between 1 and 500);
  end if;
end $$;

create table if not exists public.profile_deal_breakers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  label text not null,
  normalized_key text not null,
  other_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_key)
);

alter table public.profile_deal_breakers
  add column if not exists other_text text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profile_deal_breakers_normalized_key_check'
  ) then
    alter table public.profile_deal_breakers
      add constraint profile_deal_breakers_normalized_key_check
      check (
        normalized_key in (
          'smoking',
          'wants_children_mismatch',
          'religion_values_mismatch',
          'political_values_mismatch',
          'pets_mismatch',
          'substance_use',
          'financial_instability',
          'long_distance',
          'other'
        )
      ) not valid;
  end if;
end $$;

alter table public.profile_deal_breakers enable row level security;

create index if not exists profile_deal_breakers_user_id_idx on public.profile_deal_breakers(user_id);
create index if not exists profiles_location_coordinates_idx on public.profiles(location_latitude, location_longitude);

create or replace function public.save_matching_profile(
  p_user_id uuid,
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
