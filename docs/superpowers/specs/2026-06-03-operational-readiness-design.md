# Operational Readiness Design

## Goal

Ensure admins and support can operate the MVP after launch: recover payments, retry reports, manage content, respond to moderation issues, and understand what to do when user-facing flows fail.

## Current Context

Admin pages exist for content, matching settings, payments, reports, and moderation. Audited publish/archive, draft editing, payment recovery, and report retry actions exist at a baseline level. Claim-link recovery and RLS hardening are still separate launch items.

## Recommended Approach

Create an operational runbook and fill the remaining support gaps with small admin workflows. Prioritize actions that prevent paid-user dead ends.

## Runbook Scenarios

Payment:

- Payment pending after return.
- Payment failed.
- Payment cancelled.
- Duplicate webhook.
- Late paid webhook after replacement checkout.
- Provider reconciliation needed.

Report:

- Report generation pending too long.
- Report generation failed.
- Retry with original prompt.
- Retry with latest prompt.
- Completed report link lost.

Account and claim:

- User cannot register from report.
- Claim token expired.
- Claim token already used.
- User registered with wrong email.

Matching and chat:

- User cannot access matches.
- User reports another user.
- User needs to block another user.
- Admin needs to inspect moderation metadata.

## Admin UX Requirements

- Actions must explain impact before execution.
- Dangerous or irreversible actions require confirmation.
- Every operational action writes an audit log with actor, target, reason, and timestamp.
- Tables should show enough identifiers to support a user without exposing raw secrets.
- Errors should include what the admin can do next.

## Missing Admin Capabilities To Add Or Verify

- Claim-link recovery action.
- Clear moderation status workflow.
- Explicit audited admin message access if message inspection is required.
- User blocking workflow if not already exposed in user UI.
- Basic runbook documentation linked from admin pages or repository docs.

## Testing

- Unit tests for each server action guard.
- Unit tests for audit payloads.
- E2E or route-level smoke for payment recovery, report retry, and claim-link recovery.
- Manual runbook walkthrough before launch.

## Launch Criteria

- Admin can handle failed payment, failed report, and lost report link.
- Support actions are audited.
- Moderation and blocking paths are documented.
- A short launch runbook exists in `docs/`.
