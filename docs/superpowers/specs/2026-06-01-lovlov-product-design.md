# lovlov.me Product Design

Date: 2026-06-01
Status: Approved by product owner for implementation planning
Source flow: `C:\Users\admin\Downloads\lovlov_me_complete_final_fixed.docx`

## Product Summary

`lovlov.me` is a Hebrew-first, RTL dating and relationship platform built around a paid AI relationship report and a registered-user matchmaking engine.

The guest product is a 99 NIS AI-generated personal relationship report based on a short configurable questionnaire. The registered product is automatic matchmaking based on a deeper configurable questionnaire, archetype profiling, weighted compatibility rules, and live chat between matched users.

## Core User Flow

### Paid AI Report Funnel

1. Guest lands on `lovlov.me`.
2. Guest completes Questionnaire A, seeded from the 22 warm/intuitive questions in the source document.
3. The app stores answers in a temporary quiz session.
4. Guest pays 99 NIS through CHING.
5. CHING webhook confirms payment.
6. The app generates an AI report using the admin-managed prompt template, quiz answers, archetype logic, and report metadata.
7. User sees the report and can download it if PDF output is enabled.
8. The report invites the user to register and continue into the matching engine.

The paid report page includes a secure, single-use registration handoff token. When the user registers from the report page, the new account claims the paid quiz session and report. The claim token must expire, be bound to the paid session, and be invalidated after successful account linking.

### Registered Matching Funnel

1. User registers only after seeing the AI report.
2. User completes the deeper matching questionnaire, seeded from the 95 questions in the source document.
3. The 95-question questionnaire is fully configurable from admin: questions, blocks, order, answer types, and scoring/matching use.
4. The app builds a dating/matching profile from quiz answers and profile fields.
5. The matching engine ranks compatible users using hard filters and admin-adjustable weighted criteria.
6. User receives ranked matches.
7. User can open a match and live chat with them.

## Admin Panel Scope

### Questionnaires

Admins can create, edit, publish, unpublish, reorder, and group questionnaire content.

Questionnaires are versioned. User answers always reference the exact published questionnaire version they answered, so historical reports and matching inputs remain reproducible after admin edits.

Supported question types:

- Multiple choice
- Scale/rating
- Open text

Questionnaire configuration includes:

- 22-question paid report quiz
- 95-question registered matching questionnaire
- Blocks/sections, including the three source-document blocks:
  - emotions and shadows
  - relationship and communication patterns
  - future relationship vision
- Per-question usage flags:
  - AI report input
  - archetype scoring
  - matching input
  - profile/deal-breaker input

### Archetypes

Admins can manage the base archetype library, seeded from the 12 profiles in the source document:

1. החם הנסגר
2. הנותן העצמאי
3. החולם הזהיר
4. האינטנסיבי הנאמן
5. הרציונלי המשתוקק
6. החברותי הבודד
7. היציב המשעמם-את-עצמו
8. הרומנטי הפרגמטי
9. הפחדן-מחויבות
10. הנמשך לאסון
11. הצומח מהשבר
12. הטרי

Each archetype has:

- Name
- Short description
- Full report description
- Matching meaning
- Scoring rules
- Compatible/incompatible archetype guidance

Archetypes and archetype scoring rules are versioned. Reports and match calculations store the version used at generation time.

### AI Report

Admins can edit the report prompt/template provided by the product owner.

Prompt variables include:

- User display name, if provided
- Quiz answers
- Archetype
- Score summaries
- Report date
- Report number
- Brand/report copy

Admin can retry failed report generation.

Prompt templates are versioned. Reports store the prompt version, model, model settings, input snapshot, output text, and generation status. Admin retry defaults to the original prompt version for reproducibility, with an explicit admin action required to regenerate using the latest prompt version.

AI output must be validated before publishing to the user. The initial implementation should prefer structured output with required sections matching the report design. Reports must include an appropriate non-therapeutic/non-clinical disclaimer because the product gives relationship insight, not medical or mental-health diagnosis.

### Payments

Admins can view:

- CHING payment status
- CHING reference IDs
- Linked quiz session
- Linked report
- Payment amount and currency
- Failure/cancel states
- Webhook event logs

Only verified CHING webhook confirmation marks a payment as paid.

Payment handling must be idempotent. Duplicate CHING webhooks must not create duplicate reports, duplicate payment records, or duplicate account entitlements. The app must support abandoned payments, cancelled payments, late webhooks, and the case where the user returns to the app before the webhook arrives.

### Users, Matching, And Chat

Admins can manage:

- Users and admin users
- Profile completion
- Depth questionnaire answers
- Match results
- Matching weights
- Matching hard filters
- Reported/blocked users
- Chat moderation metadata

Admins can re-run matching for one user or globally.

Match settings are versioned. Each match result stores the match settings version used to calculate it.

## Matching Design

Matching runs after registration and completion of the configurable depth questionnaire.

Matching is calculated from normalized profile traits derived from questionnaire answers and profile fields. Each trait has a stable key, numeric score or categorical value, source answer references, and optional admin-defined mapping rules.

### Hard Filters

Hard filters remove impossible matches before weighted scoring:

- Gender preference
- Age range
- Location/distance
- Relationship intention
- Deal-breakers configured by admin
- Blocked users

Hard filters are symmetric unless explicitly configured otherwise. For example, both users' gender preference, age range, distance preference, and relationship intention must allow the match.

### Weighted Score

Admin-adjustable criteria contribute to a final match score:

- Quiz compatibility
- Archetype pairing
- Lifestyle compatibility
- Relationship intentions
- Communication style
- Emotional profile
- Location proximity
- Age preference fit

Users see ranked matches, not internal raw scoring details.

Scoring requirements:

- Scores normalize to a 0-100 range.
- Admin weights must normalize to 100% for active weighted criteria.
- Weighted scoring runs only after hard filters pass.
- Matching is symmetric by default: the final score should consider how well user A fits user B and how well user B fits user A.
- Ties are resolved by profile completeness, last active date, and then most recent match calculation.
- Match explanations can be stored internally for admin/debugging, but the user-facing UI should show simple compatibility language rather than raw math.
- Re-running matching creates or updates match records without deleting conversations.

## Chat Design

Chat is available between matched users.

Features:

- One conversation per matched pair
- Supabase Realtime delivery
- Persistent message history
- Read timestamps if supported in the initial build
- User report/block actions
- Admin moderation metadata

Chat safety requirements:

- Blocking a user immediately prevents new messages in both directions.
- Blocking hides or disables the conversation for the blocker while preserving message history for audit and abuse handling.
- Reporting a user creates a moderation record linked to the reporter, reported user, conversation, and optional message IDs.
- Admin access to message content must be explicit and audited.
- Deleted/disabled users must not remain matchable or chat-capable.
- Chat permissions must be enforced by database policies and server-side checks, not only by UI state.

## Technical Architecture

The app will be a new production application because the current `simple-love` folder is empty.

Approved stack:

- Next.js for public pages, quiz UI, admin panel, reports, matching, and chat
- Supabase Postgres for data
- Supabase Auth for user/admin authentication
- Supabase Realtime for live chat
- Supabase Storage for generated PDF reports if PDF output is enabled
- CHING for payment
- OpenAI API for AI report generation
- SQL migrations and Supabase client as the default data layer

Prisma is not part of the initial stack unless later required.

## Key Data Model Areas

Primary tables/entities:

- `questionnaires`
- `questionnaire_blocks`
- `questions`
- `question_options`
- `quiz_sessions`
- `quiz_answers`
- `payments`
- `reports`
- `archetypes`
- `archetype_rules`
- `profiles`
- `match_settings`
- `matches`
- `conversations`
- `messages`
- `registration_claim_tokens`
- `user_reports`
- `user_blocks`
- `admin_audit_logs`

Versioned configuration tables/entities:

- `questionnaire_versions`
- `prompt_versions`
- `archetype_versions`
- `match_settings_versions`

Derived matching data:

- `profile_traits`
- `match_explanations`

## Reliability Requirements

- Guest answers are saved before payment.
- Payment amount, currency, and session ID are validated after CHING webhook receipt.
- Report generation only starts after verified payment.
- Report generation state is tracked: pending, generating, completed, failed.
- Payment webhook processing is idempotent by CHING transaction/reference ID.
- Returning from CHING before webhook confirmation shows a pending payment state and polls or refreshes until the verified payment arrives.
- A paid session can generate only one active report unless an admin explicitly regenerates it.
- Failed report generation can be retried by admin.
- Guest report claiming is protected by an expiring single-use claim token.
- Matching can be re-run without deleting historical chat messages.
- Chat messages are persisted before realtime delivery is considered successful.
- Admin writes should be logged in audit records for important content, payment, user, and matching changes.

## Security And Permissions

Supabase Row Level Security must protect:

- Guest quiz sessions by secure token
- Registration claim tokens
- User profiles
- User reports
- Depth questionnaire answers
- Matches
- Conversations and messages
- User reports and user blocks
- Admin-only configuration tables

Admin-only actions require an admin role claim or equivalent server-side role check.

CHING webhook handling must verify authenticity using the provider-supported signing or validation mechanism.

OpenAI prompt calls must run server-side only.

The service role key must never be exposed to the browser. Any operation requiring elevated Supabase privileges must run through server-side route handlers or server actions.

## UI Direction

The application is Hebrew-first and RTL by default.

Primary UI areas:

- Landing page
- 22-question guest quiz
- CHING payment handoff/return pages
- AI report page
- Registration flow
- 95-question depth questionnaire
- Matches list
- Match profile/chat view
- Admin dashboard

The UI should feel modern, trustworthy, and emotionally warm without turning the app into a marketing-only landing page. The first usable screen should move users toward the quiz.

## Testing Strategy

Unit tests:

- Questionnaire scoring
- Prompt variable assembly
- Archetype assignment
- Match score calculation
- Permission helpers

Integration tests:

- CHING webhook state transitions
- Paid report generation workflow
- Registration after report
- Depth questionnaire submission
- Matching job behavior
- Chat message persistence

End-to-end tests:

- Guest quiz to mocked payment confirmation to report
- Report to registration
- Registered depth questionnaire to matches
- Match chat flow
- Admin edits questionnaire and publishes changes

External services are mocked in tests unless running explicit provider sandbox tests.

## Open Implementation Decisions

- Exact CHING API/webhook fields must be confirmed from current CHING documentation before implementation.
- The final AI prompt will be provided by the product owner.
- PDF generation can be initial or phase-two depending on launch needs; the in-app report page is required.
- Realtime chat should use Supabase Realtime in the initial production stack.
- The first implementation should define the initial trait map and matching weights from the source questionnaire before admin fine-tuning.
