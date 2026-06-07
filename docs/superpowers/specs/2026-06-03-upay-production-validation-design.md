# CHING Production Validation Design

## Goal

Validate the real CHING payment integration against the merchant sandbox before live traffic, with clear evidence that checkout, return, webhook, and recovery paths match the final provider contract.

## Current Context

The app has a mock CHING adapter for local development and a real adapter that upserts a customer and creates a checkout session with line items, success/cancel URLs, metadata, and bearer authentication. The webhook route verifies `Ching-Signature`, validates amount and currency, stores webhook metadata, and finalizes payment idempotently.

Real sandbox credentials and final webhook behavior require merchant support.

## Recommended Approach

Run a controlled provider validation checklist using a staging deployment with real HTTPS callback URLs. Keep code changes limited to contract gaps discovered during validation. Do not add token refresh unless the merchant account proves that bearer tokens are short-lived.

## Environment Requirements

- `APP_BASE_URL` points to a public HTTPS staging origin.
- `CHING_API_BASE` points to the CHING API base URL provided for the merchant account.
- `CHING_API_KEY` contains a valid bearer access token.
- `CHING_WEBHOOK_SECRET` contains the configured webhook signing secret.
- Supabase service role, anon key, and OpenAI key are set server-side only.
- Staging database has seeded paid-report content.

## Validation Matrix

Checkout:

- Successful checkout creation returns a non-empty checkout session id and URL.
- Invalid bearer token fails safely without creating duplicate entitlements.
- Callback URLs include `payment=<payment_id>`.

Webhook:

- Signed success webhook marks payment paid only after signature, amount, currency, and payment id validation.
- Duplicate success webhook is idempotent.
- Mismatched amount is rejected.
- Mismatched charge identifier is rejected when present.
- Late success webhook after internal cancellation finalizes the original paid payment if provider evidence is valid.

Return:

- User returning before webhook sees pending state and polling.
- Failed return shows retry path.
- Cancelled return shows retry path.
- Report-ready return links to `/report/[claim_token]`.

Recovery:

- Admin reconciliation stores provider response but does not mark paid without verified webhook or explicit supported provider evidence path.
- Replacement checkout creates only one active replacement.

## Provider Questions To Confirm

- Is `CHING_API_KEY` a long-lived bearer token or must it be generated from client credentials?
- Which webhook field is authoritative for amount?
- Which field maps to the checkout session, charge id, and app payment metadata?
- Which status values represent cancelled, failed, abandoned, and paid?
- Are webhook retries guaranteed, and what is the retry window?

## Test Evidence To Capture

For each matrix case, capture:

- Payment id.
- Provider transaction id.
- Request and response status without secrets.
- Stored payment status before and after.
- Relevant `raw_payload` fields with tokens redacted.
- User-facing page state.

## Code Change Policy

Only change code after validation proves a contract mismatch. Each provider-specific change needs:

- A unit test with the captured fixture.
- A passing existing mock-payment flow.
- No raw secret logging.

## Launch Criteria

- All success, failure, cancelled, pending, duplicate, and late-webhook scenarios are validated in sandbox.
- Merchant support confirms bearer-token lifecycle and webhook signing behavior.
- Production checklist in `PROJECT_MEMORY.md` is satisfied.
- No known provider contract mismatch remains.
