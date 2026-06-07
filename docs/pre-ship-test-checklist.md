# Pre-Ship Test Checklist - lovlov.me

What the automated suite cannot cover (real money, real AI, real Supabase auth)
must be verified by hand before launch. Run top to bottom; do not ship with any
blocker unchecked.

Automated coverage that already exists: 63 unit test files (`npm test`) plus
Playwright specs covering quiz, admin, chat, safety, and funnel routing. Payment,
AI, and most Supabase paths still use mocks or fixture mode.

---

## 0. Automated gates

- [x] `npm test` is fully green (270/270 on 2026-06-07).
- [x] `npm run build` succeeds (2026-06-07).
- [ ] `npm run e2e` passes against a local dev server.
- [ ] `npm run verify:rls` all checks pass. Currently blocked because the configured Supabase project is missing migration tables.
- [ ] Optional realtime check: when Supabase integration env vars are configured, run `RUN_SUPABASE_INTEGRATION=1 npm run verify:realtime-chat`.

---

## 1. Payments - real CHING sandbox (BLOCKER)

Every automated payment test uses the mock adapter; E2E stops at checkout.
Nothing exercises real money. Requires merchant credentials, `CHING_API_BASE`,
`CHING_API_KEY`, `CHING_WEBHOOK_SECRET`, and `APP_BASE_URL` as the public HTTPS origin.

- [ ] Happy path: quiz to real checkout redirect to pay to webhook to report to claim link.
- [ ] Webhook trust: a webhook with a wrong or missing token is rejected.
- [ ] Idempotency: replaying the same valid webhook does not double-process.
- [ ] Cancelled payment: return page shows cancelled state and links back to the saved quiz session.
- [ ] Failed payment: return page shows failed state and recovery path.
- [ ] Abandoned payment: session is not left stuck; status resolves or stays recoverable.
- [ ] Return-before-webhook: polling resolves to paid once the webhook lands.
- [ ] Amount and currency charged match the configured price.

## 2. AI report generation - real OpenAI key (BLOCKER)

Unit tests run the deterministic local fallback. Set a real `OPENAI_API_KEY`.

- [ ] Real model output passes `reportOutputSchema` validation.
- [ ] Forced generation failure marks the report `failed`, and admin retry recovers it.
- [ ] Report renders correctly in Hebrew / RTL on `/report/[token]`.
- [ ] Pending and failed report states are handled in the UI after payment.

## 3. Supabase RLS - verified with real auth (BLOCKER)

`npm run verify:rls` now provisions throwaway users and asserts owner,
participant, anon, cross-user, block-row, and server-only table behavior. As of
2026-06-07 it stops during fixture setup because the configured Supabase project
does not have the matching/profile migration stack applied.

- [ ] Apply local migrations through `supabase/migrations/202606070001_security_safety_hardening.sql` to the target Supabase project.
- [ ] Fix target schema cache missing `profile_deal_breakers`.
- [ ] Re-run `npm run verify:rls` until all checks pass.
- [ ] Spot-check beyond the script: user A cannot read user B's reports, messages, or quiz answers.

## 4. Blocking and moderation (BLOCKER)

- [x] Blocking immediately stops new messages in both directions in fixture-backed E2E (`tests/e2e/chat-safety.spec.ts`, 2026-06-07).
- [x] Blocked and disabled users are excluded from matching and chat by unit coverage.
- [x] Admin access to message content is explicit and audited via `moderation.messages.view`.

## 5. Config and secrets hygiene (BLOCKER)

- [ ] Production env vars set server-only: `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `CHING_API_BASE`, `CHING_API_KEY`, `CHING_WEBHOOK_SECRET`.
- [ ] No placeholder values remain in production.
- [ ] `APP_BASE_URL` is the public HTTPS origin.

## 6. Full funnel smoke

- [ ] One uninterrupted manual pass: quiz to real payment to report to registration claim to matching profile to depth questionnaire to matches to chat.
- [ ] Hebrew/RTL copy audited on every user-facing screen touched in the funnel.

---

## Notes

- Remote Supabase migrations are not applied automatically by this checklist.
- Payment and OpenAI production validation remain outside this hardening wave.
