# lovlov.me MVP Missing Pieces

Date: 2026-06-02

This document compares the approved MVP/product scope with the current implementation status recorded in `PROJECT_MEMORY.md` and the current repo. It is intended as the planning source of truth for the next implementation phase.

## Recommended Next Build Order

1. Registration claim handoff from paid report to registered account.
2. Profile and depth-questionnaire completion path for registered users.
3. Matching data generation and match recalculation flow.
4. Admin CRUD and audit-backed publishing workflows.
5. Real CHING contract validation and production payment hardening.
6. Report retry and recovery states.
7. Chat safety completion: blocking, moderation metadata, and audited admin message access.

## Critical Missing Pieces

### 1. Registration Claim Handoff

Current state:

- Paid report generation creates `registration_claim_tokens`.
- `/report/[token]` loads a completed report by claim token.
- Registration UI exists at a baseline level.

Missing:

- Registration submission must consume a valid `registration_claim_tokens` row.
- The token must be single-use, unexpired, and bound to the paid quiz session/report.
- Successful registration must set `claimed_by` and `claimed_at`.
- The created Supabase Auth user must be attached to the paid report/session.
- Invalid, expired, already-claimed, and mismatched tokens need clear user-facing states.
- Add tests for successful claim, expired token, reused token, invalid token, and already-linked report.

Why it matters:

- This is the bridge between the paid guest report funnel and the registered matching product.
- Without it, the MVP user cannot reliably move from report to account ownership.

### 2. Registered Profile And Depth Questionnaire Flow

Current state:

- Matching questionnaire routes and pages exist.
- Matching/session domain contracts exist.
- Matches page can render data and now has an E2E test harness for authenticated chat.

Missing:

- End-to-end registered-user flow from claimed report to profile creation.
- Profile fields needed by matching hard filters: gender/preference, age or age range, location/distance, relationship intention, and deal-breakers.
- Completion tracking for the 95-question depth questionnaire.
- Persistence of depth questionnaire answers to the exact published questionnaire version.
- Profile trait extraction from answers and profile fields.
- User-facing gating so users cannot view real matches until profile/depth questionnaire completion.

Why it matters:

- Matching cannot be meaningful until registered users have complete profile and questionnaire data.

### 3. Matching Engine Completion

Current state:

- Matching domain tests and score contracts exist.
- Matches table and match settings contracts exist.
- Matches UI exists.

Completed since the original audit:

- Hard filters cover reciprocal gender preference, age range, distance radius, relationship intention, canonical deal-breaker overlap, blocked users, and disabled users.
- Weighted scoring uses the active `match_settings_versions`.
- Admin match-settings versions can be drafted, edited, published, archived, and used for user/global reruns.
- Match record updates preserve existing conversations.
- Unit and E2E coverage exists for match settings and rerun flows.

Remaining:

- Production should still validate the published matching settings against real seed data before launch.

Why it matters:

- This is the core registered-user value after payment and report claiming.

### 4. Admin CRUD And Audit Workflows

Current state:

- Admin shell pages render live service-role-backed lists/status tables.
- Domain contract tests exist for admin questionnaires, prompts, archetypes, moderation, matching settings, auth, audit, payments, and reports.

Missing:

- Form-backed create/update/publish/archive flows for questionnaires, questions, blocks, options, prompts, archetypes, and match settings.
- Reorder/group controls for questionnaire blocks and questions.
- Version publishing workflows that preserve historical answered versions.
- Admin audit log writes for important content, matching, payment, user, and moderation changes.
- Admin user management and role enforcement beyond baseline contracts.
- Admin flows for rerunning matching for one user or globally.
- E2E coverage for admin editing and publishing at least one questionnaire/versioned config.

Why it matters:

- The MVP requires admin-managed content and matching configuration, not only read-only lists.

### 5. Payment Production Hardening

Current state:

- Mock CHING adapter works locally.
- Checkout creates payment rows and moves quiz sessions to `payment_pending`.
- CHING webhook route verifies `Ching-Signature` before applying events.
- Real CHING checkout requests create/upsert customers and checkout sessions using `CHING_API_BASE` and `CHING_API_KEY`.
- Payment state transitions and idempotency contracts exist.

Missing:

- Validate current CHING sandbox credentials, checkout session creation, and bearer token handling with merchant support.
- Validate signed CHING webhook behavior against the merchant sandbox callback configuration.
- Handle abandoned, cancelled, failed, late-webhook, and return-before-webhook states in the UI.
- Ensure amount, currency, charge, and metadata validation matches the final CHING contract.

Production checklist:

- `CHING_API_BASE` should point at the CHING API base URL provided for the merchant account.
- `CHING_API_KEY` must be a valid CHING bearer access token.
- `CHING_WEBHOOK_SECRET` must match the configured CHING webhook signing secret.
- `APP_BASE_URL` must be the public HTTPS origin used for `notifyUrl`, `successUrl`, and `failureUrl`.
- Sandbox validation should include successful checkout, failed/cancelled return, duplicate webhook, amount mismatch, and late-webhook cases.

Why it matters:

- The paid report funnel depends on payment correctness and webhook trust.

### 6. Report Retry And Recovery

Current state:

- Report generation stores completed/failed status.
- If `OPENAI_API_KEY` is absent, deterministic local fallback output is used.
- Admin reports page lists live records/statuses.

Missing:

- Admin retry action for failed report generation.
- Explicit option to retry with original prompt version versus regenerate with latest prompt version.
- User-facing handling for pending or failed report generation after payment.
- Optional support recovery strategy if raw claim links need to be recoverable without exposing token hashes.

Why it matters:

- Paid users need a recoverable path when AI generation or payment finalization fails.

### 7. Chat Safety And Moderation Completion

Current state:

- Chat messages persist.
- Conversation access checks exist.
- Reporting creates moderation records.
- Supabase Realtime remains the intended production transport.
- E2E harness verifies message send, simulated inbound display, and report submission.

Missing:

- User block action and UI.
- Blocking must immediately prevent new messages both directions.
- Blocking should hide or disable the conversation for the blocker while preserving audit history.
- Disabled/deleted users must be excluded from matching and messaging.
- Admin moderation metadata views/actions.
- Admin access to message content must be explicit and audited.
- Tests for blocking, disabled users, moderation records, and audited message access.

Why it matters:

- Chat exists, but MVP safety requirements are not complete until blocking and moderation are enforced.

## Secondary Or Phase-Two Candidates

- PDF generation/download for reports if launch requires it; in-app report page is already required for MVP.
- Encrypted one-time claim URL delivery records for support recovery.
- Richer match profile view beyond basic match card/chat entry.
- Read timestamps for chat if feasible in the initial launch.
- Provider sandbox tests for CHING once credentials and final docs are available.

## Cross-Cutting Gaps

- Supabase RLS policies should be reviewed and expanded for all user-owned data paths once the user flows are connected.
- Hebrew-first RTL copy should be audited after each user-facing feature addition.
- E2E coverage should expand from chat harness to the full funnel: quiz -> mocked payment -> report -> registration claim -> depth questionnaire -> matches -> chat.
- Production secrets must remain server-only: service-role key, OpenAI key, and CHING credentials.

## Suggested Next Plan

Start with **Registration Claim Handoff** because it unlocks the transition from paid report to registered matching and is the first missing bridge in the approved MVP flow.

The implementation plan should cover:

- Claim-token validation service.
- Registration submission integration.
- Report/session ownership linking.
- Clear user states for invalid/expired/reused tokens.
- Unit tests and one E2E path from report page to successful registration claim.
