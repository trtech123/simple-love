# Admin REST Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add REST admin API parity for existing admin server-action domains while preserving compatibility wrappers where the UI still needs them.

**Architecture:** Build shared admin REST helpers for auth, validation, audit logging, and response envelopes, then migrate each admin domain to route handlers under `src/app/api/admin`. Existing server actions call shared domain/service functions or thinly wrap REST-compatible services so behavior is consistent across UI, tests, and external admin clients.

**Tech Stack:** Next.js App Router REST route handlers, TypeScript, Supabase service-role client, Zod or existing validation functions, Vitest route tests, Playwright admin smoke tests.

---

## Scope Boundary

This milestone includes REST parity for:

- Questionnaires.
- Prompts.
- Archetypes.
- Payments and report-link recovery.
- Reports retry/recovery operations.
- Users.
- Moderation.

This milestone does not include:

- Rewriting every admin page if a server action remains a thin compatibility wrapper.
- Changing public quiz/payment/report contracts beyond shared helper reuse.
- Adding new admin feature domains beyond the listed parity set.

## Files

Create:

- `src/domain/admin/rest.ts`: admin REST auth, request parsing, validation response helpers, and audit wrapper.
- `src/app/api/admin/questionnaires/route.ts`
- `src/app/api/admin/questionnaires/[versionId]/route.ts`
- `src/app/api/admin/questionnaires/[versionId]/publish/route.ts`
- `src/app/api/admin/questionnaires/[versionId]/archive/route.ts`
- `src/app/api/admin/prompts/route.ts`
- `src/app/api/admin/prompts/[versionId]/route.ts`
- `src/app/api/admin/prompts/[versionId]/publish/route.ts`
- `src/app/api/admin/prompts/[versionId]/archive/route.ts`
- `src/app/api/admin/archetypes/route.ts`
- `src/app/api/admin/archetypes/[versionId]/route.ts`
- `src/app/api/admin/archetypes/[versionId]/publish/route.ts`
- `src/app/api/admin/archetypes/[versionId]/archive/route.ts`
- `src/app/api/admin/payments/route.ts`
- `src/app/api/admin/payments/[paymentId]/recovery/route.ts`
- `src/app/api/admin/reports/route.ts`
- `src/app/api/admin/reports/[reportId]/retry/route.ts`
- `src/app/api/admin/users/route.ts`
- `src/app/api/admin/users/[userId]/route.ts`
- `src/app/api/admin/users/[userId]/disable/route.ts`
- `src/app/api/admin/users/[userId]/enable/route.ts`
- `src/app/api/admin/moderation/reports/route.ts`
- `src/app/api/admin/moderation/conversations/[conversationId]/disable/route.ts`
- `tests/unit/admin-rest-helper.test.ts`
- `tests/unit/admin-questionnaires-rest.test.ts`
- `tests/unit/admin-prompts-rest.test.ts`
- `tests/unit/admin-archetypes-rest.test.ts`
- `tests/unit/admin-payments-reports-rest.test.ts`
- `tests/unit/admin-users-rest.test.ts`
- `tests/unit/admin-moderation-rest.test.ts`
- `tests/e2e/admin-rest-parity.spec.ts`

Modify:

- `src/app/admin/actions/questionnaires.ts`
- `src/app/admin/actions/prompts.ts`
- `src/app/admin/actions/archetypes.ts`
- `src/app/admin/actions/payments.ts`
- `src/app/admin/actions/reports.ts`
- `src/app/admin/actions/version-actions.ts`
- `src/app/admin/actions/guard.ts`
- Existing admin pages only where they need REST calls or Hebrew messages from the new contracts.

## Shared REST Contracts

Admin list response:

```ts
apiOk({
  items,
  pageInfo: {
    total,
    limit,
    offset,
  },
});
```

Admin mutation response:

```ts
apiOk({
  id,
  status,
  auditAction,
});
```

Common failures:

```ts
apiError(401, "authentication_required", "צריך להתחבר כדי להמשיך.");
apiError(403, "forbidden", "אין לך הרשאת מנהל.");
apiError(400, "validation_failed", "הנתונים שנשלחו אינם תקינים.", { errors });
apiError(404, "not_found", "הרשומה לא נמצאה.");
apiError(409, "version_not_editable", "אפשר לערוך רק גרסת טיוטה.");
```

## Task 1: Add Admin REST Helper

**Files:**

- Create: `src/domain/admin/rest.ts`
- Test: `tests/unit/admin-rest-helper.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/admin-rest-helper.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { requireAdminActor, writeAdminAudit } from "../../src/domain/admin/rest";

describe("admin rest helper", () => {
  it("requires app_metadata admin role", async () => {
    const supabase = {
      auth: {
        getUser: vi.fn(() =>
          Promise.resolve({
            data: { user: { id: "admin-1", app_metadata: { role: "admin" } } },
            error: null,
          }),
        ),
      },
    };

    await expect(requireAdminActor(supabase)).resolves.toEqual({ userId: "admin-1", role: "admin" });
  });

  it("rejects non-admin users", async () => {
    const supabase = {
      auth: {
        getUser: vi.fn(() =>
          Promise.resolve({
            data: { user: { id: "user-1", app_metadata: { role: "user" } } },
            error: null,
          }),
        ),
      },
    };

    await expect(requireAdminActor(supabase)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("writes audit logs", async () => {
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    const supabase = { from: vi.fn(() => ({ insert })) };

    await writeAdminAudit(supabase, {
      actorUserId: "admin-1",
      action: "questionnaire.publish",
      targetTable: "questionnaire_versions",
      targetId: "version-1",
      metadata: { version: 2 },
    });

    expect(insert).toHaveBeenCalledWith({
      actor_user_id: "admin-1",
      action: "questionnaire.publish",
      target_table: "questionnaire_versions",
      target_id: "version-1",
      metadata: { version: 2 },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/admin-rest-helper.test.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement helper**

Create `src/domain/admin/rest.ts`:

```ts
import { buildAuditLog, type AuditLogInput } from "./audit";

export class AdminRestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function requireAdminActor(supabase: {
  auth: { getUser: () => Promise<{ data: { user: { id: string; app_metadata?: Record<string, unknown> } | null }; error: unknown }> };
}) {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new AdminRestError(401, "authentication_required", "צריך להתחבר כדי להמשיך.");
  }

  if (data.user.app_metadata?.role !== "admin") {
    throw new AdminRestError(403, "forbidden", "אין לך הרשאת מנהל.");
  }

  return { userId: data.user.id, role: "admin" as const };
}

export async function writeAdminAudit(
  supabase: { from: (table: "admin_audit_logs") => { insert: (row: unknown) => Promise<{ error: { message?: string } | null }> } },
  input: AuditLogInput,
) {
  const { error } = await supabase.from("admin_audit_logs").insert(buildAuditLog(input));

  if (error) {
    throw new AdminRestError(500, "audit_write_failed", "שמירת פעולת המנהל נכשלה.", { reason: error.message });
  }
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
npm test -- tests/unit/admin-rest-helper.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/admin/rest.ts tests/unit/admin-rest-helper.test.ts
git commit -m "feat: add admin rest helper"
```

## Task 2: Add Questionnaire REST Parity

**Files:**

- Create: `src/app/api/admin/questionnaires/route.ts`
- Create: `src/app/api/admin/questionnaires/[versionId]/route.ts`
- Create: `src/app/api/admin/questionnaires/[versionId]/publish/route.ts`
- Create: `src/app/api/admin/questionnaires/[versionId]/archive/route.ts`
- Modify: `src/app/admin/actions/questionnaires.ts`
- Test: `tests/unit/admin-questionnaires-rest.test.ts`

- [ ] **Step 1: Write REST tests**

Create `tests/unit/admin-questionnaires-rest.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("admin questionnaires rest", () => {
  it("uses the shared list response", async () => {
    const response = await callQuestionnaireListAsAdmin();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { items: expect.any(Array), pageInfo: { limit: 50, offset: 0 } },
    });
  });

  it("publishes a draft and writes audit", async () => {
    const response = await callPublishQuestionnaireAsAdmin("version-1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { id: "version-1", status: "published", auditAction: "questionnaire.publish" },
    });
  });
});
```

Define `callQuestionnaireListAsAdmin` and `callPublishQuestionnaireAsAdmin` with the existing test mocking style used in `tests/unit/admin-actions-contract.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/admin-questionnaires-rest.test.ts
```

Expected: FAIL because questionnaire REST routes do not exist.

- [ ] **Step 3: Implement routes**

Contracts:

- `GET /api/admin/questionnaires`: list versions with questionnaire slug, purpose, version, status, dates.
- `POST /api/admin/questionnaires`: create draft from latest version.
- `GET /api/admin/questionnaires/[versionId]`: return editable questionnaire graph.
- `PUT /api/admin/questionnaires/[versionId]`: save draft only using the existing atomic replacement RPC.
- `POST /api/admin/questionnaires/[versionId]/publish`: publish version and archive previous published version.
- `POST /api/admin/questionnaires/[versionId]/archive`: archive version.

Audit actions:

- `questionnaire.create_draft`
- `questionnaire.update_draft`
- `questionnaire.publish`
- `questionnaire.archive`

- [ ] **Step 4: Keep server actions as wrappers**

Modify `src/app/admin/actions/questionnaires.ts` so existing actions call the same service functions used by REST routes. Keep redirects and revalidation inside server actions only.

- [ ] **Step 5: Run questionnaire REST tests**

Run:

```bash
npm test -- tests/unit/admin-questionnaires-rest.test.ts tests/unit/admin-questionnaire.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/questionnaires src/app/admin/actions/questionnaires.ts tests/unit/admin-questionnaires-rest.test.ts
git commit -m "feat: add questionnaire admin rest parity"
```

## Task 3: Add Prompts And Archetypes REST Parity

**Files:**

- Create: `src/app/api/admin/prompts/route.ts`
- Create: `src/app/api/admin/prompts/[versionId]/route.ts`
- Create: `src/app/api/admin/prompts/[versionId]/publish/route.ts`
- Create: `src/app/api/admin/prompts/[versionId]/archive/route.ts`
- Create: `src/app/api/admin/archetypes/route.ts`
- Create: `src/app/api/admin/archetypes/[versionId]/route.ts`
- Create: `src/app/api/admin/archetypes/[versionId]/publish/route.ts`
- Create: `src/app/api/admin/archetypes/[versionId]/archive/route.ts`
- Modify: `src/app/admin/actions/prompts.ts`
- Modify: `src/app/admin/actions/archetypes.ts`
- Test: `tests/unit/admin-prompts-rest.test.ts`
- Test: `tests/unit/admin-archetypes-rest.test.ts`

- [ ] **Step 1: Write tests**

Create tests that assert:

```ts
await expect(promptPublishResponse.json()).resolves.toMatchObject({
  ok: true,
  data: { status: "published", auditAction: "prompt.publish" },
});

await expect(archetypeArchiveResponse.json()).resolves.toMatchObject({
  ok: true,
  data: { status: "archived", auditAction: "archetype.archive" },
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/unit/admin-prompts-rest.test.ts tests/unit/admin-archetypes-rest.test.ts
```

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Implement prompt routes**

Prompt routes validate:

- `slug` is not empty.
- `template` is not empty.
- `model` is not empty.
- `model_settings` is an object.
- Published versions are not editable.

Audit actions:

- `prompt.create_draft`
- `prompt.update_draft`
- `prompt.publish`
- `prompt.archive`

- [ ] **Step 4: Implement archetype routes**

Archetype routes validate:

- `stable_key` is not empty.
- `name`, `short_description`, `full_description`, and `matching_meaning` are not empty Hebrew-capable text.
- `scoring_rules` is an object.
- Published versions are not editable.

Audit actions:

- `archetype.create_draft`
- `archetype.update_draft`
- `archetype.publish`
- `archetype.archive`

- [ ] **Step 5: Wrap existing actions**

Modify prompt and archetype server actions to call the shared service functions and keep redirect/revalidation behavior in the action files.

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- tests/unit/admin-prompts-rest.test.ts tests/unit/admin-archetypes-rest.test.ts tests/unit/admin-content.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/admin/prompts src/app/api/admin/archetypes src/app/admin/actions/prompts.ts src/app/admin/actions/archetypes.ts tests/unit/admin-prompts-rest.test.ts tests/unit/admin-archetypes-rest.test.ts
git commit -m "feat: add prompt and archetype rest parity"
```

## Task 4: Add Payments And Reports Recovery REST Parity

**Files:**

- Create: `src/app/api/admin/payments/route.ts`
- Create: `src/app/api/admin/payments/[paymentId]/recovery/route.ts`
- Create: `src/app/api/admin/reports/route.ts`
- Create: `src/app/api/admin/reports/[reportId]/retry/route.ts`
- Modify: `src/app/admin/actions/payments.ts`
- Modify: `src/app/admin/actions/reports.ts`
- Test: `tests/unit/admin-payments-reports-rest.test.ts`

- [ ] **Step 1: Write tests**

Create `tests/unit/admin-payments-reports-rest.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("admin payments and reports rest", () => {
  it("lists payments with recovery status", async () => {
    const response = await callPaymentsListAsAdmin();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { items: expect.any(Array), pageInfo: { limit: 50, offset: 0 } },
    });
  });

  it("retries a failed report", async () => {
    const response = await callReportRetryAsAdmin("report-1", { promptMode: "original" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { id: "report-1", auditAction: "report.retry" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/admin-payments-reports-rest.test.ts
```

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Implement payment routes**

Contracts:

- `GET /api/admin/payments`: list payment id, provider, status, amount, currency, quiz session id, report id, user id, created date.
- `POST /api/admin/payments/[paymentId]/recovery`: create an encrypted one-time recovery delivery record or return existing valid recovery metadata, according to the existing payment recovery domain.

Audit actions:

- `payment.recovery_create`
- `payment.recovery_resend`

- [ ] **Step 4: Implement report routes**

Contracts:

- `GET /api/admin/reports`: list report id, status, report number, payment/session relation, user id, prompt version id, error, created date.
- `POST /api/admin/reports/[reportId]/retry`: accepts `{ "promptMode": "original" }` or `{ "promptMode": "latest" }`.

Audit actions:

- `report.retry_original_prompt`
- `report.retry_latest_prompt`

- [ ] **Step 5: Wrap existing actions**

Modify payments and reports server actions so UI flows call shared service functions. Preserve current page redirects.

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- tests/unit/admin-payments-reports-rest.test.ts tests/unit/admin-payment-actions.test.ts tests/unit/report-retry.test.ts tests/unit/payment-recovery.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/admin/payments src/app/api/admin/reports src/app/admin/actions/payments.ts src/app/admin/actions/reports.ts tests/unit/admin-payments-reports-rest.test.ts
git commit -m "feat: add payment and report rest parity"
```

## Task 5: Add Users And Moderation REST Parity

**Files:**

- Create: `src/app/api/admin/users/route.ts`
- Create: `src/app/api/admin/users/[userId]/route.ts`
- Create: `src/app/api/admin/users/[userId]/disable/route.ts`
- Create: `src/app/api/admin/users/[userId]/enable/route.ts`
- Create: `src/app/api/admin/moderation/reports/route.ts`
- Create: `src/app/api/admin/moderation/conversations/[conversationId]/disable/route.ts`
- Test: `tests/unit/admin-users-rest.test.ts`
- Test: `tests/unit/admin-moderation-rest.test.ts`

- [ ] **Step 1: Write tests**

Create tests asserting:

```ts
await expect(disableUserResponse.json()).resolves.toMatchObject({
  ok: true,
  data: { id: "user-1", status: "disabled", auditAction: "user.disable" },
});

await expect(disableConversationResponse.json()).resolves.toMatchObject({
  ok: true,
  data: { id: "conversation-1", status: "disabled", auditAction: "moderation.conversation.disable" },
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/unit/admin-users-rest.test.ts tests/unit/admin-moderation-rest.test.ts
```

Expected: FAIL because user/moderation REST routes do not exist.

- [ ] **Step 3: Implement user routes**

Contracts:

- `GET /api/admin/users`: list profiles joined with auth-visible metadata available to the server.
- `GET /api/admin/users/[userId]`: detail profile, payments, reports, matches, moderation records.
- `POST /api/admin/users/[userId]/disable`: set `profiles.disabled_at = now()`.
- `POST /api/admin/users/[userId]/enable`: set `profiles.disabled_at = null`.

Audit actions:

- `user.disable`
- `user.enable`

- [ ] **Step 4: Implement moderation routes**

Contracts:

- `GET /api/admin/moderation/reports`: list user reports with reporter, reported user, conversation id, message ids, reason, created date.
- `POST /api/admin/moderation/conversations/[conversationId]/disable`: set conversation status to `disabled`.

Audit actions:

- `moderation.conversation.disable`

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- tests/unit/admin-users-rest.test.ts tests/unit/admin-moderation-rest.test.ts tests/unit/admin-moderation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/users src/app/api/admin/moderation tests/unit/admin-users-rest.test.ts tests/unit/admin-moderation-rest.test.ts
git commit -m "feat: add users and moderation rest parity"
```

## Task 6: Admin REST E2E Smoke

**Files:**

- Create: `tests/e2e/admin-rest-parity.spec.ts`
- Modify: admin pages only where smoke failures expose missing REST wiring.

- [ ] **Step 1: Write E2E smoke**

Create `tests/e2e/admin-rest-parity.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("admin sections load with REST-backed data", async ({ page }) => {
  for (const path of [
    "/admin/questionnaires",
    "/admin/prompts",
    "/admin/archetypes",
    "/admin/payments",
    "/admin/reports",
    "/admin/users",
    "/admin/moderation",
  ]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  }
});
```

- [ ] **Step 2: Run E2E**

Run:

```bash
npm run e2e -- tests/e2e/admin-rest-parity.spec.ts
```

Expected: PASS after admin auth fixture is in place.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/admin-rest-parity.spec.ts src/app/admin
git commit -m "test: add admin rest parity smoke"
```

## Acceptance Gates

- [ ] `npm test -- tests/unit/admin-rest-helper.test.ts tests/unit/admin-questionnaires-rest.test.ts tests/unit/admin-prompts-rest.test.ts tests/unit/admin-archetypes-rest.test.ts tests/unit/admin-payments-reports-rest.test.ts tests/unit/admin-users-rest.test.ts tests/unit/admin-moderation-rest.test.ts`
- [ ] `npm run e2e -- tests/e2e/admin-rest-parity.spec.ts`
- [ ] `npm run build`
- [ ] Every admin REST mutation checks `app_metadata.role === "admin"`.
- [ ] Every admin REST mutation writes `admin_audit_logs`.
- [ ] Existing admin server actions remain functional or are removed only after their page no longer imports them.
