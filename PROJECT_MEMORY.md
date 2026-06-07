# Project Memory

## Completed

- Phase 1 foundation is in place for `lovlov.me`: Next.js app shell, Supabase schema contracts, seed data, payment/report/matching/admin domain contracts, and baseline pages.
- Admin shell and domain contract tests exist for questionnaire, prompt/content, moderation, match settings, archetypes, auth, audit, payment state, report generation, matching, chat permissions, and claim tokens.
- The paid-report seed contains the current 22-question questionnaire.
- `npm run db:seed` now seeds the paid questionnaire, the published report prompt, and the 12 published archetype versions idempotently using `.env.local` Supabase service-role credentials.
- `/quiz` is now a real guest quiz wizard backed by API routes that use Supabase quiz sessions and quiz answers through a service-role server client.
- Quiz sessions use `quiz_sessions.public_token` as the browser-safe identifier.
- Quiz completion validates all required multiple-choice answers, marks the session `completed`, and the browser then creates checkout through `POST /api/payments/checkout`.
- Checkout creates a `payments` row, moves the quiz session to `payment_pending`, and uses the mock CHING adapter locally unless real CHING endpoint credentials are configured.
- `/payment/return?payment=<id>&mockPayment=paid` finalizes local mock payment, marks payment/session paid, generates a report, creates a registration claim token, and links to `/report/<claim_token>`.
- `POST /api/payments/ching/webhook` verifies the CHING webhook signature before applying payment events.
- Paid report generation assembles saved answers with the published prompt/archetype, requests JSON output from OpenAI when `OPENAI_API_KEY` is present, validates `reportOutputSchema`, persists completed/failed reports, and creates claim tokens for completed reports.
- `/report/[token]` now loads completed report data by registration claim token instead of raw quiz session token.
- Claim registration now creates the user/profile, attaches the paid report/session, signs the browser in, and sends the user to `/profile/matching`.
- `/profile/matching` collects the required matching profile fields before the depth questionnaire: birth year, preferred age range, gender, interested-in, structured city/area selection, preferred distance radius, relationship intention, and canonical deal-breakers.
- `GET/PUT /api/profile/matching` load and save authenticated matching preferences. Save-time geocoding happens before mutation; selected MVP locations submit trusted coordinates directly; unchanged location text reuses cached coordinates; failed geocoding returns clear user-facing copy and does not mutate profile state.
- Matching profile saves now call `public.save_matching_profile(...)`, a Supabase RPC that updates `profiles` and replaces `profile_deal_breakers` inside one database transaction.
- Matching profile preferences are represented in Supabase by `profiles.preferred_age_min`, `profiles.preferred_age_max`, `profiles.location_latitude`, `profiles.location_longitude`, `profiles.location_geocoded_at`, `profiles.preferred_distance_km`, and `profile_deal_breakers` with canonical `normalized_key` values plus optional `other_text`.
- `/matching/questionnaire` session creation is gated on a complete matching profile.
- `/matches` now sends users to the next missing funnel step: matching profile, then depth questionnaire, then real matches.
- Matching now supports user-selected distance radius using geocoded profile coordinates.
- Personality traits remain the only match score inputs; location is a reciprocal eligibility preference.
- Matching hard filters now include reciprocal gender preference, reciprocal age range, reciprocal distance radius, same relationship intention, canonical deal-breaker overlap exclusion, blocked users, and disabled profiles. The `other` deal-breaker is stored for display/admin review but does not participate in hard-filter matching.
- Admin pages for questionnaires, prompts, archetypes, matching settings, payments, and reports now render live service-role-backed operational tables.
- Admin operational controls now support audited publish/archive actions for prompt, questionnaire, archetype, and match-settings versions, plus guarded retry actions for failed reports using original or latest paid-report prompts.
- Admin content editors now support audited draft creation and draft-only editing for prompts, questionnaires, archetypes, and match settings. Questionnaire draft saves use an atomic Supabase RPC to replace blocks, questions, and options.
- The matching engine adminization work is complete for the current MVP scope: published match settings drive scoring and filters, matching rerun APIs exist for user/global scopes, admin UI controls are present, and unit/E2E coverage exists.
- Shared API envelope helpers exist at `src/app/api/envelope.ts`.
- `GET/PUT /api/profile/matching` now use `{ ok, data }` envelopes and Hebrew error messages.
- Profile-form config is versioned in `profile_form_configs` / `profile_form_config_versions`.
- Public `/api/profile/matching/config` serves the published config with a development fallback.
- Admin `/admin/profile-form` and `/api/admin/profile-form-config` manage profile-form config versions with audit logs.
- Matching profile UI is Hebrew RTL and config-driven.
- Current local E2E dev URL: `http://127.0.0.1:3100`.
- Vercel Preview now has `CHING_API_BASE`, `CHING_API_KEY`, `CHING_WEBHOOK_SECRET`, and `APP_BASE_URL` set via `npx vercel env add` as of 2026-06-07.

## Current Limitations

- The quiz flow expects a published paid-report questionnaire in Supabase. If it is missing, session creation fails clearly.
- `npm run db:seed` requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; keep the service-role key server-only.
- Real CHING checkout is selected only when `CHING_API_BASE` and `CHING_API_KEY` are present. `CHING_WEBHOOK_SECRET` is required for webhook signature validation.
- If `OPENAI_API_KEY` is absent, report generation uses a deterministic local fallback output so local mock payment can complete.
- Replayed paid webhooks are idempotent for payment state; the return link can reuse a preserved `raw_payload.claimToken`, but a missing raw token cannot be reconstructed from the stored hash.
- Radius matching depends on stored profile coordinates. MVP location selections provide coordinates directly; custom free-text locations still depend on save-time geocoding.
- Nominatim public usage is suitable for MVP/local volume only; production scale may require a paid or self-hosted geocoder.
- The MVP deal-breaker taxonomy is fixed and exact-key based; there is no synonym mapping, severity weighting, or per-deal-breaker weighting yet.
- Real CHING sandbox credential validation still requires merchant-side credentials/support and cannot be completed from the local workspace alone.
- Supabase migrations through `supabase/migrations/202606070001_security_safety_hardening.sql` exist locally but must be applied remotely by an operator with permission before `npm run verify:rls` can pass against the configured project.
- Preview CHING payment testing requires a fresh Preview redeploy after env changes. `CHING_API_BASE` was copied from the commented `.env.local` line and should be confirmed as the CHING sandbox/test base URL before running payment tests.

## Next Steps

- Apply the outstanding Supabase migrations remotely, then rerun `npm run verify:rls`.
- Validate real CHING sandbox credentials end to end with merchant support before live traffic.
- Validate real OpenAI report generation with a production-like key before live traffic.
- Add structured location autocomplete or a production geocoding provider only if traffic grows beyond save-time geocoding volume.
- Review Supabase RLS policies across user-owned profile, report, match, chat, and moderation paths after claim-link recovery is in place.

## CHING Production Checklist

- Set `CHING_API_BASE` to the CHING API base URL provided for the merchant account.
- Set `CHING_API_KEY` to a currently valid CHING bearer access token.
- Set `CHING_WEBHOOK_SECRET` to the shared secret used to verify `Ching-Signature`.
- Set `APP_BASE_URL` to the public HTTPS origin so `notifyUrl`, `successUrl`, and `failureUrl` are externally reachable.
- Validate CHING sandbox checkout, customer creation, cancellation/failure returns, and signed webhook events against `POST /api/payments/ching/webhook` before enabling production checkout.
