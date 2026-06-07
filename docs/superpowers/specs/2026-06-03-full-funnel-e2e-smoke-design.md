# Full Funnel E2E And Smoke Coverage Design

## Goal

Cover the launch-critical user journey from quiz through chat with automated smoke tests that catch broken handoffs between payment, reports, claim registration, matching, and messaging.

## Current Context

Unit tests cover most domain services. Playwright E2E covers quiz checkout, payment return states, matching profile, matching questionnaire, matches, and chat harness pieces. The full funnel should be connected into a smaller launch smoke suite that runs reliably in CI or before release.

## Recommended Approach

Build a deterministic E2E mode that uses mock payment and fixture data while exercising real pages, route handlers, and client interactions. Keep the suite small, stable, and focused on handoff correctness.

## Core Smoke Journey

1. Guest opens `/quiz`.
2. Guest completes the 22-question paid report quiz.
3. Guest starts mock payment.
4. Payment return finalizes payment and creates report/claim token.
5. Guest opens report page.
6. Guest registers from report claim.
7. Registered user lands on `/profile/matching`.
8. User saves matching profile with structured location and canonical deal-breaker.
9. User completes matching questionnaire.
10. User lands on `/matches`.
11. User opens chat for a match.
12. User sends a message.

## Secondary Smoke Cases

- Failed payment return links back to saved quiz.
- Cancelled payment return links back to saved quiz.
- Return-before-webhook shows pending polling.
- Invalid claim token shows clear state.
- Incomplete profile redirects matches page to `/profile/matching`.
- Profile-only user redirects matches page to `/matching/questionnaire`.

## Test Data Strategy

- Use `E2E_TEST_MODE=1`.
- Seed deterministic fixture users and matches through test-only endpoints.
- Avoid real CHING and OpenAI.
- Keep tests independent by resetting fixture data before each file or test group.

## Assertions

Prefer stable structural assertions:

- URLs and route transitions.
- Visible headings when text is stable.
- Form labels for English/localized form controls.
- Presence of report sections, match score, chat input, and sent message.

Avoid assertions against corrupted or environment-dependent encoded text.

## Failure Diagnostics

- Enable Playwright trace on retry.
- Capture error context.
- Use fixed test ids only where accessible labels are not stable enough.
- Keep route mocks local to individual tests.

## Launch Criteria

- Full funnel smoke passes locally.
- Full funnel smoke passes in staging or CI.
- Failure states for payment and claim registration are covered.
- The smoke suite runs fast enough to be used before every release.
