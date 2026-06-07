# Supabase RLS Security Audit Design

## Goal

Confirm that user-owned data and admin-only operations are protected by Supabase RLS and server-side authorization before production launch.

## Current Context

The app uses service-role clients for privileged server routes/actions and Supabase Auth for users. Sensitive tables already enable RLS in foundation migrations, but the connected user flows now span reports, claim tokens, profiles, matches, conversations, messages, moderation records, admin actions, and payment recovery.

## Recommended Approach

Create an RLS audit pass that documents table ownership rules, adds missing policies, and tests access with anon/authenticated clients. Keep service-role usage server-only and use explicit server guards for admin operations.

## Protected Surfaces

User-owned:

- `profiles`
- `profile_deal_breakers`
- `profile_traits`
- `quiz_sessions`
- `quiz_answers`
- `reports`
- `report_artifacts`
- `registration_claim_tokens`
- `matches`
- `conversations`
- `messages`
- `user_reports`
- `user_blocks`

Admin-only:

- `admin_audit_logs`
- prompt, archetype, questionnaire, match-settings draft/publish tables
- payment recovery actions
- moderation review actions

## Access Rules

Profiles:

- User can read and update their own profile through authenticated paths.
- User cannot read hidden fields for other users.
- Public match cards expose only curated profile fields through server loaders.

Reports:

- Guest report access remains token-based through server routes.
- Claimed reports are visible only to the claiming user and admins.
- Raw claim token hashes are never readable by clients.

Matches and chat:

- Users can read only matches where they are `user_a` or `user_b`.
- Users can read conversations only for their matches.
- Users can insert messages only in conversations they participate in and are not blocked from.
- Blocked users cannot create new messages either direction.

Admin:

- Browser clients cannot write admin tables directly.
- Admin server actions require `requireAdminActionActor`.
- Audit logs are append-only from server-side actions.

## Deliverables

- Migration adding or updating RLS policies.
- Test helpers that simulate authenticated user ids.
- Contract tests for own-user allowed access and cross-user denied access.
- Documentation table mapping each sensitive table to allowed roles and operations.

## Testing

- Unit or integration-style tests for policy SQL text where local Supabase is unavailable.
- If local Supabase is available, run authenticated client checks:
  - user A cannot read user B profile details.
  - user A cannot read user B report.
  - user A can read own conversations.
  - blocked message insert is denied.
  - anon cannot read sensitive tables.
  - admin actions remain server-guarded.

## Launch Criteria

- Every sensitive table has an explicit expected RLS posture.
- Cross-user reads/writes are denied.
- Admin-only writes are not available to browser clients.
- Service-role key remains server-only in code and deployment config.
