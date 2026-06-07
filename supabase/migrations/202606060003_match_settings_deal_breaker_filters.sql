alter table public.match_settings_versions
  add column if not exists deal_breaker_filters jsonb not null default '[
    "smoking",
    "wants_children_mismatch",
    "religion_values_mismatch",
    "political_values_mismatch",
    "pets_mismatch",
    "substance_use",
    "financial_instability",
    "long_distance"
  ]'::jsonb;
