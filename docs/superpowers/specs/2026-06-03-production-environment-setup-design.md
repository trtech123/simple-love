# Production Environment Setup Design

## Goal

Define the repeatable production setup required to deploy `lovlov.me` with the correct database schema, seed data, environment variables, and operational checks.

## Current Context

The app is a Next.js project backed by Supabase, OpenAI, and CHING. Local seed and test flows exist. Production must apply migrations, seed published content, configure external providers, and keep server-only secrets out of the browser.

## Recommended Approach

Create a deployment runbook and a small verification checklist. Treat production setup as a release gate, not an ad hoc deployment step.

## Required Environment Variables

Public browser-safe:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Server-only:

- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `CHING_API_BASE`
- `CHING_API_KEY`
- `CHING_WEBHOOK_SECRET`
- `APP_BASE_URL`
- `CLAIM_LINK_ENCRYPTION_KEY` after claim recovery is implemented

E2E-only:

- `E2E_TEST_MODE`
- `NEXT_PUBLIC_E2E_TEST_MODE`

E2E variables must not be enabled in production.

## Database Setup

1. Apply all Supabase migrations in order.
2. Run seed command against production with service-role credentials:
   - paid-report questionnaire
   - matching questionnaire
   - published report prompt
   - archetype versions
   - default match settings
3. Confirm `public.save_matching_profile(...)` exists.
4. Confirm RLS policies are present after the security audit.

## Smoke Checks

Public:

- Homepage loads.
- `/quiz` creates a guest session.
- Quiz completion reaches checkout.
- Payment return pending state renders.
- Report page loads by valid token.

Authenticated:

- Claim registration creates a user/profile.
- Matching profile saves selected location and deal-breakers.
- Matching questionnaire can be completed.
- Matches page shows active matches.
- Chat conversation can send a message.

Admin:

- Admin dashboard loads for admin actor.
- Published content tables are populated.
- Payment recovery actions are visible.
- Report retry action is guarded.

## Rollback And Recovery

- Keep previous deployment available until smoke checks pass.
- Do not rollback database migrations automatically if they include data changes.
- For failed seed, rerun idempotent seed after fixing env/config.
- For failed CHING validation, switch checkout traffic off or keep mock disabled in production until provider issue is resolved.

## Testing

- `npm test`
- `npm run build`
- targeted Playwright smoke suite against staging
- manual CHING sandbox validation

## Launch Criteria

- Production env vars are configured and classified.
- Migrations and seed completed.
- Smoke checks pass on staging.
- CHING sandbox validation is complete.
- RLS/security audit is complete.
