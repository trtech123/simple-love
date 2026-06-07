# 2026-06-07 Security and Safety Hardening QA

## Scope

- Added local Supabase RLS hardening migration: `202606070001_security_safety_hardening.sql`.
- Expanded `npm run verify:rls` into a seeded owner/participant/anon/cross-user/server-only contract.
- Added conversation-scoped blocking endpoint and chat UI block action.
- Hardened message sending so blocked conversations and blocked pairs return `conversation_blocked`.
- Added audited admin message review endpoint and live `/admin/moderation` report table.

## Command Results

- `npm test` - FAIL in the current workspace: 269 passed, 8 failed, 277 total. The failures are the visual-taste matching/card/seed tests (`matching.test.ts`, `matching-settings-published.test.ts`, `quiz-wizard.test.tsx`, `seed-data.test.ts`, `supabase-matching-repository.test.ts`) and are separate from the CHING/docs/lint/E2E cleanup.
- `npx tsc --noEmit` - PASS.
- `npm run lint` - PASS/non-interactive, with 7 pre-existing warnings.
- `npm run build` - PASS, with the same lint warnings reported during Next build.
- `npm run e2e -- tests/e2e/chat-safety.spec.ts` - PASS.
- `npm run e2e -- tests/e2e/chat.spec.ts tests/e2e/chat-safety.spec.ts tests/e2e/user-flow.spec.ts tests/e2e/admin.spec.ts` - PASS, 13 tests.
- `npm run e2e -- tests/e2e/admin-rest-parity.spec.ts` - PASS.
- `npm run e2e -- tests/e2e/rtl-visual-smoke.spec.ts` - PASS, 36 tests.
- `npm run e2e` - PASS, 62 tests.
- `npm run verify:rls` - NOT RERUN. Apply remote Supabase migrations through `202606070001_security_safety_hardening.sql`, then rerun.

## Remaining Risks

- Remote Supabase migrations were not applied from this workspace.
- `verify:rls` has not passed against the configured Supabase project yet.
- Full Playwright now passes locally in E2E mode.
- Real CHING and real OpenAI production credentials remain unvalidated.

## UI Notes

- Chat page now includes a Hebrew block action.
- After blocking, the composer is removed and a blocked-state message is shown.
- No screenshots were captured in this pass; the fixture-backed E2E verified the visible blocked confirmation and composer removal.
