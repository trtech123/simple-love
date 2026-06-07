create table if not exists public.payment_products (
  product_key text primary key check (product_key in ('paid_report', 'matching_unlock')),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null default 'ILS' check (currency = 'ILS'),
  item_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.payment_products (product_key, amount_minor, currency, item_name, active)
values
  ('paid_report', 9900, 'ILS', 'דוח עומק זוגי', true),
  ('matching_unlock', 9900, 'ILS', 'פתיחת התאמות וצ''אט', true)
on conflict (product_key) do nothing;

alter table public.payments
  add column if not exists product_key text not null default 'paid_report'
    check (product_key in ('paid_report', 'matching_unlock')),
  add column if not exists user_id uuid references auth.users(id);

alter table public.payments
  alter column quiz_session_id drop not null;

alter table public.payments
  add constraint payments_owner_required_chk
  check (
    (product_key = 'paid_report' and quiz_session_id is not null)
    or
    (product_key = 'matching_unlock' and user_id is not null)
  ) not valid;

alter table public.payments validate constraint payments_owner_required_chk;

create index if not exists payments_user_id_idx on public.payments(user_id);
create index if not exists payments_product_key_idx on public.payments(product_key);

create table if not exists public.matching_entitlements (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  source_payment_id uuid references public.payments(id),
  granted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.payment_products enable row level security;
alter table public.matching_entitlements enable row level security;
