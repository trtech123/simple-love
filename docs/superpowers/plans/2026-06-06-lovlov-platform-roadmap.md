# LovLov Platform Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current LovLov foundation into a Hebrew RTL platform where user matching, admin configuration, and operational recovery flows are REST-addressable, audited, and testable.

**Architecture:** Ship four bounded milestones in order. The matching-profile milestone restores the broken user path and establishes shared REST/config patterns; the matching-engine milestone makes published admin settings drive scoring; the admin REST milestone applies the same endpoint/auth/audit conventions across all admin domains; the polish milestone hardens Hebrew copy, RTL UX, responsiveness, and end-to-end coverage.

**Tech Stack:** Next.js App Router, TypeScript, Supabase Auth/Postgres/RLS/RPCs, service-role server clients, Vitest, Playwright, React Testing Library.

---

## Platform Goal

LovLov should let a paid, registered user complete a Hebrew RTL matching profile, answer the depth questionnaire, receive active matches calculated from the currently published match-settings version, and interact with an admin system whose mutations are available through consistent REST APIs, validated inputs, audit logs, and versioned publish workflows.

## Required Milestone Order

1. `docs/superpowers/plans/2026-06-06-matching-profile-system.md`
2. `docs/superpowers/plans/2026-06-06-matching-engine-adminization.md`
3. `docs/superpowers/plans/2026-06-06-admin-rest-parity.md`
4. `docs/superpowers/plans/2026-06-06-hebrew-platform-polish.md`

The order is strict because each milestone consumes contracts from the previous one:

- Plan 1 creates the shared API envelope, schema-health response pattern, and first public/admin configurable profile form.
- Plan 2 consumes the profile completeness contract and extends match-settings versions into real matching reruns.
- Plan 3 reuses the admin REST helpers from Plans 1 and 2 across the broader admin surface.
- Plan 4 assumes functional flows exist and focuses on Hebrew/RTL quality, visual QA, and end-to-end hardening.

## Shared API Conventions

All new REST route handlers must return one of these JSON shapes:

```ts
type ApiSuccess<T = unknown> = {
  ok: true;
  data?: T;
};

type ApiFailure = {
  ok: false;
  code: string;
  message: string;
  details?: unknown;
};
```

Rules:

- `message` is real UTF-8 Hebrew and safe for human display.
- `code` is stable English for tests, logs, and programmatic handling.
- Validation failures use HTTP `400`.
- Unauthenticated failures use HTTP `401`.
- Non-admin failures use HTTP `403`.
- Missing records use HTTP `404`.
- Schema-health/configuration failures use HTTP `503` when the requested feature cannot operate.
- Unexpected server failures use HTTP `500` with a generic Hebrew message and a logged server-side error.

Minimum shared helper target:

- Create `src/lib/api/envelope.ts`.
- Export `apiOk(data?, init?)`, `apiError(status, code, message, details?)`, and `apiException(error, code, message)`.
- Existing routes may migrate incrementally, but every route touched by these plans must use this envelope.

## Shared Admin Rules

Admin access:

- The authenticated Supabase user must have `app_metadata.role === "admin"`.
- Server code reads the role through Supabase Auth admin/user APIs or a trusted server-side session, never from client-submitted form data.
- A non-admin authenticated user receives `{ ok: false, code: "forbidden", message: "אין לך הרשאת מנהל." }`.

Audit logging:

- Every admin mutation writes `admin_audit_logs`.
- Audit entries use `actor_user_id`, `action`, `target_table`, `target_id`, and `metadata`.
- Tests assert the audit insert is attempted for each mutation path.

Versioned config:

- Draft, publish, and archive behavior follows the current model used by `questionnaire_versions`, `prompt_versions`, `archetype_versions`, and `match_settings_versions`.
- Publishing one version archives the previously published version in the same group.
- Published versions are immutable through public and admin APIs.
- Draft mutations are allowed only through admin endpoints and must be audited.

## Shared Localization Rules

- All visible application strings are real UTF-8 Hebrew.
- Mojibake is a blocking bug.
- Public and admin layouts use RTL (`dir="rtl"`) and Hebrew language metadata where applicable.
- English identifiers are allowed in code, logs, tests, route names, and API `code` fields.
- API `message` fields are Hebrew whenever the message can reach the browser.

## Shared Schema-Health Rules

Each milestone that depends on Supabase schema must include a health check close to the feature boundary:

- Public user routes expose a feature-specific `schemaHealth` value in successful reads when useful.
- Broken required schema returns an API failure with `code: "schema_unavailable"` and a Hebrew message.
- Admin pages should render a Hebrew operational alert for missing migrations instead of crashing.
- Remote Supabase migrations are not applied without explicit permission and working credentials.

## Shared Testing Gates

Each milestone must finish with:

- Focused unit tests for each domain behavior change.
- Route/API tests for REST contracts and envelope shape.
- E2E tests for milestone-critical user/admin flows.
- Browser screenshot QA for changed UI at desktop and mobile widths.
- `npm test` passing.
- Targeted `npm run e2e -- <spec>` passing for changed flows.
- `npm run build` passing unless the milestone plan explicitly records a current unrelated build blocker with file path and error.

## Plan 1 Entry Criteria

- Current repository checks out with the existing Next/Supabase app.
- Existing matching-profile files are present:
  - `src/app/profile/matching/page.tsx`
  - `src/app/profile/matching/matching-profile-form.tsx`
  - `src/app/api/profile/matching/route.ts`
  - `src/domain/matching/profile.ts`
  - `supabase/migrations/202606020002_matching_profile_preferences.sql`
- No remote Supabase migration is applied without explicit user permission.

## Plan 1 Exit Criteria

- `/profile/matching` no longer fails when required local schema exists.
- Missing matching-profile schema produces a Hebrew schema-health error instead of a crash.
- `GET/PUT /api/profile/matching` use the shared API envelope.
- The matching profile UI is Hebrew RTL with no English user-facing validation copy.
- Public profile-form config is versioned and admin-editable through REST.
- Tests and browser QA prove the user can save a complete profile.

## Plan 2 Entry Criteria

- Plan 1 exit criteria are met.
- Matching profiles can be saved and profile form configuration is published.
- Existing match-settings version records can be listed in admin.

## Plan 2 Exit Criteria

- Published match-settings versions drive scoring weights, hard filters, and deal-breaker rules.
- Admin REST APIs support match settings draft, publish, archive, validation, and rerun requests.
- One-user and global matching reruns are available from admin UI.
- Recalculated `matches` rows store the exact `match_settings_version_id`.
- Tests prove reruns are deterministic, audited, and protected by admin auth.

## Plan 3 Entry Criteria

- Plan 2 exit criteria are met.
- Shared admin REST/auth/audit helpers exist and are covered by tests.

## Plan 3 Exit Criteria

- REST admin API parity exists for questionnaires, prompts, archetypes, payments/reports recovery, users, and moderation.
- Existing server actions either call REST-backed service functions or remain as UI-only compatibility wrappers with tests.
- Admin mutation responses, validation, and audit logging are standardized.
- Route tests cover all admin REST contracts.

## Plan 4 Entry Criteria

- Plans 1, 2, and 3 exit criteria are met.
- All critical user/admin workflows are functional through REST and UI.

## Plan 4 Exit Criteria

- Mojibake and English visible copy are removed from public and admin surfaces.
- Public and admin surfaces are verified Hebrew/RTL.
- Responsive UI, empty states, loading states, and validation copy are polished.
- E2E coverage spans paid user registration through matches plus admin config/rerun/recovery paths.
- Browser screenshot QA artifacts exist for desktop and mobile critical pages.

## Roadmap Execution Checklist

- [ ] **Step 1: Confirm current branch and dirty state**

Run:

```bash
git status --short
```

Expected: Review changed files and preserve unrelated user changes.

- [ ] **Step 2: Execute Plan 1**

Run the implementation plan:

```bash
docs/superpowers/plans/2026-06-06-matching-profile-system.md
```

Expected: Plan 1 exit criteria are all satisfied before continuing.

- [ ] **Step 3: Execute Plan 2**

Run the implementation plan:

```bash
docs/superpowers/plans/2026-06-06-matching-engine-adminization.md
```

Expected: Plan 2 exit criteria are all satisfied before continuing.

- [ ] **Step 4: Execute Plan 3**

Run the implementation plan:

```bash
docs/superpowers/plans/2026-06-06-admin-rest-parity.md
```

Expected: Plan 3 exit criteria are all satisfied before continuing.

- [ ] **Step 5: Execute Plan 4**

Run the implementation plan:

```bash
docs/superpowers/plans/2026-06-06-hebrew-platform-polish.md
```

Expected: Plan 4 exit criteria are all satisfied.

- [ ] **Step 6: Final full verification**

Run:

```bash
npm test
npm run build
npm run e2e
```

Expected: All commands pass, or any failure is recorded with exact file path, command output summary, and owner decision.
