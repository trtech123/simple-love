# Launch TODO

## Done

- Supabase RLS hardening applied to project `kkeuokndpzhbfqhizqgm`.
- `npm run verify:rls` passed: 76/76 checks.
- Security/safety code hardening implemented:
  - Conversation blocking endpoint.
  - Blocked chat send returns `conversation_blocked`.
  - Chat block UI disables composer.
  - Admin audited message review endpoint.
  - Live admin moderation page.

## Still Missing

- Run a real CHING sandbox checkout/payment/webhook test.
- Add `CHING_API_BASE` to the real environment. Without it, the app uses the mock payment adapter.
- Validate real OpenAI report generation with a real `OPENAI_API_KEY`.
- Update old `tests/e2e/chat.spec.ts` selectors from English labels to Hebrew UI labels.
- Run full `npm run e2e` cleanly end to end after the selector update.

## Notes

- Real payment and real OpenAI validation are still launch blockers.
- RLS/security verification is no longer blocked.
