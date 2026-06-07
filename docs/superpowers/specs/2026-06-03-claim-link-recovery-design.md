# Claim Link Recovery Design

## Goal

Give support a safe way to recover or resend a paid user's report link without storing raw claim tokens in plaintext or weakening the existing hashed claim-token model.

## Current Context

Completed reports create `registration_claim_tokens` with only a token hash stored. `/report/[token]` loads by raw token, and payment finalization may preserve a raw `claimToken` in `payments.raw_payload` when available. If that raw token is missing, support cannot reconstruct the report link from the hash.

## Users And Use Cases

- Paid guest: lost the report link before registering.
- Support/admin: verifies the payment or quiz session and sends a fresh usable report link.
- System: preserves auditability and prevents support from seeing reusable secrets unless explicitly needed.

## Recommended Approach

Create encrypted one-time claim delivery records whenever a claim token is generated. Store the raw claim URL encrypted with a server-only key, plus a short delivery status lifecycle. Support can create a recovery delivery for an existing completed report by rotating or reissuing a claim token, then copying or sending the newly decrypted one-time URL through an audited admin action.

This approach keeps the current hashed lookup model intact and makes recovery explicit, audited, and revocable.

## Data Model

Add `claim_link_deliveries`:

- `id uuid primary key`
- `report_id uuid not null references reports(id)`
- `quiz_session_id uuid not null references quiz_sessions(id)`
- `payment_id uuid references payments(id)`
- `claim_token_id uuid not null references registration_claim_tokens(id)`
- `encrypted_claim_url text not null`
- `encryption_key_version text not null`
- `delivery_status text not null check in ('created', 'viewed_by_admin', 'sent', 'revoked', 'expired')`
- `expires_at timestamptz not null`
- `created_by uuid references auth.users(id)`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- `last_viewed_at timestamptz`
- `sent_at timestamptz`

The encrypted value must contain the full public report URL, not only the token, so support can copy the exact user-facing link. Raw URLs must never be logged.

## Application Behavior

When paid report generation succeeds:

1. Create the normal `registration_claim_tokens` row.
2. Build `${APP_BASE_URL}/report/${rawToken}`.
3. Encrypt the full URL with `CLAIM_LINK_ENCRYPTION_KEY`.
4. Insert a `claim_link_deliveries` row with `delivery_status = 'created'`.

When support needs recovery:

1. Admin opens the report or payment record.
2. Admin chooses `Recover report link`.
3. If an unexpired delivery exists, admin can reveal it once.
4. If no usable delivery exists, the system creates a new claim token for the same completed report and a new encrypted delivery.
5. Revealing the URL writes an admin audit log with actor, report, payment, and delivery id.

## Security Rules

- Encryption key is server-only and never exposed to the browser.
- Decryption is only available in admin server actions after admin guard checks.
- Reveal actions are audited.
- A delivery can be revoked without deleting the underlying report.
- Expired or already-claimed claim tokens cannot be recovered as active links. The recovery action must issue a fresh claim token bound to the same report.
- Admin UI must not show raw tokens in tables or logs.

## Error Handling

- Missing encryption key: recovery actions fail with a clear admin-only configuration error.
- Missing completed report: action fails and writes no delivery row.
- Already claimed report: action shows the linked account and does not create a new guest claim link.
- Expired delivery: action offers creation of a fresh recovery link.

## Testing

- Unit test encryption and decryption round trip with a deterministic key.
- Unit test that raw claim URL is not stored in plaintext.
- Unit test delivery creation during report finalization.
- Unit test recovery creates a fresh token when the original raw token is unavailable.
- Unit test reveal action requires admin and writes audit log.
- E2E admin smoke test: completed report -> recover link -> open recovered `/report/[token]`.

## Launch Criteria

- Support can recover a report link for a completed, unclaimed paid report.
- Recovery is audited.
- Raw claim URL is encrypted at rest.
- Existing `/report/[token]` and registration claim behavior remains unchanged.
