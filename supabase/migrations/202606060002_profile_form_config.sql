create table if not exists public.profile_form_configs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_form_config_versions (
  id uuid primary key default gen_random_uuid(),
  profile_form_config_id uuid not null references public.profile_form_configs(id) on delete cascade,
  version integer not null,
  status text not null check (status in ('draft', 'published', 'archived')),
  config jsonb not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (profile_form_config_id, version)
);

alter table public.profile_form_configs enable row level security;
alter table public.profile_form_config_versions enable row level security;

insert into public.profile_form_configs (slug)
values ('default')
on conflict (slug) do nothing;

with default_config as (
  select id
  from public.profile_form_configs
  where slug = 'default'
)
insert into public.profile_form_config_versions (
  profile_form_config_id,
  version,
  status,
  config,
  published_at
)
select
  default_config.id,
  1,
  'published',
  '{
    "direction": "rtl",
    "birthYear": { "minAge": 18, "maxAge": 120 },
    "preferredAge": { "min": 18, "max": 120 },
    "preferredDistanceKm": { "min": 1, "max": 500, "default": 50 },
    "genderOptions": [
      { "value": "woman", "label": "אישה" },
      { "value": "man", "label": "גבר" },
      { "value": "non_binary", "label": "א-בינארי" },
      { "value": "other", "label": "אחר" }
    ],
    "interestedInOptions": [
      { "value": "woman", "label": "נשים" },
      { "value": "man", "label": "גברים" },
      { "value": "everyone", "label": "כולם" }
    ],
    "relationshipIntentions": [
      { "value": "serious", "label": "קשר רציני" },
      { "value": "long_term", "label": "קשר ארוך טווח" },
      { "value": "marriage", "label": "חתונה ומשפחה" },
      { "value": "open_to_explore", "label": "פתוח/ה להכיר" }
    ],
    "dealBreakers": [
      { "value": "smoking", "label": "עישון" },
      { "value": "wants_children_mismatch", "label": "חוסר התאמה ברצון לילדים" },
      { "value": "religion_values_mismatch", "label": "חוסר התאמה בדת או ערכים" },
      { "value": "political_values_mismatch", "label": "חוסר התאמה בעמדות פוליטיות" },
      { "value": "pets_mismatch", "label": "חוסר התאמה בנושא בעלי חיים" },
      { "value": "substance_use", "label": "שימוש בחומרים" },
      { "value": "financial_instability", "label": "חוסר יציבות כלכלית" },
      { "value": "long_distance", "label": "מרחק גדול מדי" },
      { "value": "other", "label": "אחר" }
    ]
  }'::jsonb,
  now()
from default_config
on conflict (profile_form_config_id, version) do nothing;

create index if not exists profile_form_config_versions_config_id_idx
  on public.profile_form_config_versions(profile_form_config_id);
