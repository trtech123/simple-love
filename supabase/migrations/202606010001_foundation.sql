create extension if not exists "pgcrypto";

create type public.question_type as enum ('multiple_choice', 'scale', 'open_text');
create type public.quiz_session_status as enum ('started', 'completed', 'payment_pending', 'paid', 'report_generating', 'report_ready', 'report_failed');
create type public.payment_status as enum ('created', 'pending', 'paid', 'failed', 'cancelled');
create type public.report_status as enum ('pending', 'generating', 'completed', 'failed');
create type public.match_status as enum ('active', 'hidden', 'blocked');
create type public.conversation_status as enum ('active', 'blocked', 'disabled');

create table public.questionnaires (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  purpose text not null check (purpose in ('paid_report', 'matching')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.questionnaire_versions (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references public.questionnaires(id),
  version integer not null,
  status text not null check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (questionnaire_id, version)
);

create table public.questionnaire_blocks (
  id uuid primary key default gen_random_uuid(),
  questionnaire_version_id uuid not null references public.questionnaire_versions(id) on delete cascade,
  title text not null,
  position integer not null,
  unique (questionnaire_version_id, position)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  questionnaire_block_id uuid not null references public.questionnaire_blocks(id) on delete cascade,
  stable_key text not null,
  prompt text not null,
  question_type public.question_type not null,
  position integer not null,
  usage_flags jsonb not null default '{}'::jsonb,
  trait_mapping jsonb not null default '{}'::jsonb,
  unique (questionnaire_block_id, position)
);

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  label text not null,
  value text not null,
  position integer not null,
  score jsonb not null default '{}'::jsonb,
  unique (question_id, value)
);

create table public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  public_token text not null unique,
  user_id uuid references auth.users(id),
  questionnaire_version_id uuid not null references public.questionnaire_versions(id),
  status public.quiz_session_status not null default 'started',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  quiz_session_id uuid not null references public.quiz_sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  question_option_id uuid references public.question_options(id),
  text_answer text,
  created_at timestamptz not null default now(),
  unique (quiz_session_id, question_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  quiz_session_id uuid not null references public.quiz_sessions(id),
  provider text not null default 'upay',
  provider_reference text not null,
  status public.payment_status not null default 'created',
  amount_minor integer not null,
  currency text not null default 'ILS',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_reference)
);

create table public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  version integer not null,
  status text not null check (status in ('draft', 'published', 'archived')),
  template text not null,
  model text not null,
  model_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (slug, version)
);

create table public.archetypes (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique,
  created_at timestamptz not null default now()
);

create table public.archetype_versions (
  id uuid primary key default gen_random_uuid(),
  archetype_id uuid not null references public.archetypes(id),
  version integer not null,
  status text not null check (status in ('draft', 'published', 'archived')),
  name text not null,
  short_description text not null,
  full_description text not null,
  matching_meaning text not null,
  scoring_rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (archetype_id, version)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  quiz_session_id uuid not null references public.quiz_sessions(id),
  user_id uuid references auth.users(id),
  prompt_version_id uuid not null references public.prompt_versions(id),
  archetype_version_id uuid references public.archetype_versions(id),
  status public.report_status not null default 'pending',
  report_number text not null unique,
  input_snapshot jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quiz_session_id)
);

create table public.report_artifacts (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  artifact_type text not null check (artifact_type in ('pdf')),
  storage_bucket text not null,
  storage_path text not null,
  content_type text not null default 'application/pdf',
  created_at timestamptz not null default now(),
  unique (report_id, artifact_type)
);

create table public.registration_claim_tokens (
  id uuid primary key default gen_random_uuid(),
  quiz_session_id uuid not null references public.quiz_sessions(id),
  report_id uuid not null references public.reports(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  claimed_by uuid references auth.users(id),
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  birth_year integer,
  gender text,
  interested_in text,
  location_text text,
  relationship_intention text,
  completed_depth_questionnaire_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_traits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  trait_key text not null,
  numeric_value numeric,
  text_value text,
  source_answer_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, trait_key)
);

create table public.match_settings (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.match_settings_versions (
  id uuid primary key default gen_random_uuid(),
  match_settings_id uuid not null references public.match_settings(id),
  version integer not null,
  status text not null check (status in ('draft', 'published', 'archived')),
  weights jsonb not null,
  hard_filters jsonb not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (match_settings_id, version)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(user_id),
  user_b uuid not null references public.profiles(user_id),
  match_settings_version_id uuid not null references public.match_settings_versions(id),
  score numeric not null check (score >= 0 and score <= 100),
  status public.match_status not null default 'active',
  calculated_at timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a < user_b)
);

create table public.match_explanations (
  match_id uuid primary key references public.matches(id) on delete cascade,
  explanation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.matches(id),
  status public.conversation_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(user_id),
  body text not null check (length(body) > 0 and length(body) <= 4000),
  created_at timestamptz not null default now()
);

create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(user_id),
  reported_user_id uuid not null references public.profiles(user_id),
  conversation_id uuid references public.conversations(id),
  message_ids uuid[] not null default '{}',
  reason text not null,
  created_at timestamptz not null default now()
);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(user_id),
  blocked_user_id uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_user_id)
);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  action text not null,
  target_table text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.quiz_sessions enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.payments enable row level security;
alter table public.reports enable row level security;
alter table public.report_artifacts enable row level security;
alter table public.registration_claim_tokens enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_traits enable row level security;
alter table public.matches enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.user_reports enable row level security;
alter table public.user_blocks enable row level security;

create index payments_quiz_session_id_idx on public.payments(quiz_session_id);
create index reports_user_id_idx on public.reports(user_id);
create index report_artifacts_report_id_idx on public.report_artifacts(report_id);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index matches_user_a_idx on public.matches(user_a);
create index matches_user_b_idx on public.matches(user_b);
