# lovlov.me Admin CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the authenticated admin CRUD layer for managing configurable questionnaires, archetypes, prompt versions, match settings, users, payments, reports, and moderation records.

**Architecture:** Extend the Phase 1 Next.js + Supabase foundation with server-only admin services, admin authorization guards, versioned publishing workflows, audit logging, and focused admin pages. Admin mutations go through server actions or route handlers using explicit admin checks; browser components render forms and lists but never receive service-role credentials.

**Tech Stack:** Next.js App Router, TypeScript, Supabase Auth/Postgres/RLS, server actions, Vitest, Playwright, React Testing Library.

---

## Scope Boundary

This phase assumes Phase 1 foundation exists and all Phase 1 verification is green.

Phase 2 includes:

- Admin authorization helper.
- Admin audit logging service.
- Questionnaire/block/question/option CRUD.
- Questionnaire publish/version workflow.
- Archetype version CRUD.
- Prompt version CRUD.
- Match settings CRUD and weight validation.
- Admin read-only payment/report views with report retry action contract.
- User/profile management basics: list, view, disable/enable.
- Moderation basics: reports, blocks, disable conversation.
- Admin Playwright smoke coverage.

Phase 2 does not include:

- Final public UI polish.
- Real UPay/OpenAI provider wiring.
- Full analytics dashboards.
- Advanced role hierarchy beyond admin/non-admin.

## File Structure

Create or modify these files:

- `src/domain/admin/auth.ts`: admin authorization helper.
- `src/domain/admin/audit.ts`: audit log builder.
- `src/domain/admin/questionnaire-admin.ts`: questionnaire validation and publish rules.
- `src/domain/admin/archetype-admin.ts`: archetype validation.
- `src/domain/admin/prompt-admin.ts`: prompt validation.
- `src/domain/admin/match-settings-admin.ts`: weight/hard-filter validation.
- `src/domain/admin/moderation-admin.ts`: moderation state rules.
- `src/app/admin/layout.tsx`: admin shell.
- `src/app/admin/page.tsx`: admin overview.
- `src/app/admin/questionnaires/page.tsx`: questionnaire list.
- `src/app/admin/questionnaires/[id]/page.tsx`: questionnaire editor.
- `src/app/admin/archetypes/page.tsx`: archetype list/editor entry.
- `src/app/admin/prompts/page.tsx`: prompt versions.
- `src/app/admin/matching/page.tsx`: match settings.
- `src/app/admin/payments/page.tsx`: payments list.
- `src/app/admin/reports/page.tsx`: reports list/retry entry.
- `src/app/admin/users/page.tsx`: users list.
- `src/app/admin/moderation/page.tsx`: moderation queue.
- `src/app/admin/actions/*.ts`: server actions for mutations.
- `tests/unit/admin-*.test.ts`: domain tests.
- `tests/e2e/admin-crud.spec.ts`: admin smoke flow.

## Task 1: Admin Authorization And Audit Rules

**Files:**

- Create: `src/domain/admin/auth.ts`
- Create: `src/domain/admin/audit.ts`
- Test: `tests/unit/admin-auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/admin-auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertAdminRole } from "../../src/domain/admin/auth";
import { buildAuditLog } from "../../src/domain/admin/audit";

describe("admin authorization", () => {
  it("allows users with admin role", () => {
    expect(() => assertAdminRole({ userId: "u1", role: "admin" })).not.toThrow();
  });

  it("rejects non-admin users", () => {
    expect(() => assertAdminRole({ userId: "u1", role: "user" })).toThrow("Admin access required");
  });

  it("builds audit log entries for admin mutations", () => {
    expect(
      buildAuditLog({
        actorUserId: "admin-1",
        action: "questionnaire.publish",
        targetTable: "questionnaire_versions",
        targetId: "version-1",
        metadata: { version: 2 },
      }),
    ).toEqual({
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
npm test -- tests/unit/admin-auth.test.ts
```

Expected: FAIL because admin domain files do not exist.

- [ ] **Step 3: Implement admin auth and audit helpers**

Create `src/domain/admin/auth.ts`:

```ts
export type AdminActor = {
  userId: string;
  role: string | null | undefined;
};

export function assertAdminRole(actor: AdminActor): asserts actor is AdminActor & { role: "admin" } {
  if (actor.role !== "admin") {
    throw new Error("Admin access required");
  }
}
```

Create `src/domain/admin/audit.ts`:

```ts
export type AuditLogInput = {
  actorUserId: string;
  action: string;
  targetTable: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
};

export function buildAuditLog(input: AuditLogInput) {
  return {
    actor_user_id: input.actorUserId,
    action: input.action,
    target_table: input.targetTable,
    target_id: input.targetId ?? null,
    metadata: input.metadata ?? {},
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/unit/admin-auth.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/admin tests/unit/admin-auth.test.ts
git commit -m "feat: add admin auth and audit helpers"
```

## Task 2: Questionnaire Admin Rules

**Files:**

- Create: `src/domain/admin/questionnaire-admin.ts`
- Test: `tests/unit/admin-questionnaire.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/admin-questionnaire.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateQuestionnaireDraft, canPublishQuestionnaire } from "../../src/domain/admin/questionnaire-admin";

describe("questionnaire admin rules", () => {
  it("accepts a valid questionnaire draft", () => {
    const result = validateQuestionnaireDraft({
      title: "שאלון",
      purpose: "paid_report",
      blocks: [
        {
          title: "בלוק",
          questions: [
            {
              stableKey: "q1",
              prompt: "מה קורה?",
              questionType: "multiple_choice",
              options: [
                { label: "א", value: "a" },
                { label: "ב", value: "b" },
              ],
              usageFlags: { aiReportInput: true },
            },
          ],
        },
      ],
    });

    expect(result.title).toBe("שאלון");
  });

  it("rejects multiple choice questions with fewer than two options", () => {
    expect(() =>
      validateQuestionnaireDraft({
        title: "שאלון",
        purpose: "paid_report",
        blocks: [
          {
            title: "בלוק",
            questions: [
              {
                stableKey: "q1",
                prompt: "מה קורה?",
                questionType: "multiple_choice",
                options: [{ label: "א", value: "a" }],
                usageFlags: { aiReportInput: true },
              },
            ],
          },
        ],
      }),
    ).toThrow("Multiple choice questions require at least two options");
  });

  it("publishes only drafts with at least one block and one question", () => {
    expect(canPublishQuestionnaire({ blockCount: 1, questionCount: 1, status: "draft" })).toBe(true);
    expect(canPublishQuestionnaire({ blockCount: 0, questionCount: 0, status: "draft" })).toBe(false);
    expect(canPublishQuestionnaire({ blockCount: 1, questionCount: 1, status: "published" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/admin-questionnaire.test.ts
```

Expected: FAIL because `questionnaire-admin.ts` does not exist.

- [ ] **Step 3: Implement questionnaire validation**

Create `src/domain/admin/questionnaire-admin.ts`:

```ts
import { z } from "zod";

const questionOptionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

const questionSchema = z.object({
  stableKey: z.string().min(1),
  prompt: z.string().min(1),
  questionType: z.enum(["multiple_choice", "scale", "open_text"]),
  options: z.array(questionOptionSchema).default([]),
  usageFlags: z.object({
    aiReportInput: z.boolean().optional(),
    archetypeScoring: z.boolean().optional(),
    matchingInput: z.boolean().optional(),
    profileDealBreakerInput: z.boolean().optional(),
  }),
});

const questionnaireDraftSchema = z.object({
  title: z.string().min(1),
  purpose: z.enum(["paid_report", "matching"]),
  blocks: z.array(
    z.object({
      title: z.string().min(1),
      questions: z.array(questionSchema).min(1),
    }),
  ).min(1),
});

export type QuestionnaireDraft = z.infer<typeof questionnaireDraftSchema>;

export function validateQuestionnaireDraft(value: unknown): QuestionnaireDraft {
  const draft = questionnaireDraftSchema.parse(value);

  for (const block of draft.blocks) {
    for (const question of block.questions) {
      if (question.questionType === "multiple_choice" && question.options.length < 2) {
        throw new Error("Multiple choice questions require at least two options");
      }
    }
  }

  return draft;
}

export function canPublishQuestionnaire(input: {
  blockCount: number;
  questionCount: number;
  status: "draft" | "published" | "archived";
}): boolean {
  return input.status === "draft" && input.blockCount > 0 && input.questionCount > 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/unit/admin-questionnaire.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/admin/questionnaire-admin.ts tests/unit/admin-questionnaire.test.ts
git commit -m "feat: add questionnaire admin rules"
```

## Task 3: Prompt And Archetype Admin Rules

**Files:**

- Create: `src/domain/admin/prompt-admin.ts`
- Create: `src/domain/admin/archetype-admin.ts`
- Test: `tests/unit/admin-content.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/admin-content.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validatePromptVersion } from "../../src/domain/admin/prompt-admin";
import { validateArchetypeVersion } from "../../src/domain/admin/archetype-admin";

describe("admin content rules", () => {
  it("requires prompt templates to include core variables", () => {
    expect(
      validatePromptVersion({
        template: "{{displayName}} {{answersJson}} {{archetypeName}}",
        model: "gpt-4.1-mini",
        modelSettings: { temperature: 0.7 },
      }).model,
    ).toBe("gpt-4.1-mini");
  });

  it("rejects prompt templates missing answersJson", () => {
    expect(() =>
      validatePromptVersion({ template: "{{displayName}}", model: "gpt-4.1-mini", modelSettings: {} }),
    ).toThrow("Prompt template must include {{answersJson}}");
  });

  it("accepts complete archetype content", () => {
    const result = validateArchetypeVersion({
      name: "החם הנסגר",
      shortDescription: "קצר",
      fullDescription: "תיאור מלא",
      matchingMeaning: "משמעות התאמה",
      scoringRules: { report_q01: "a" },
    });

    expect(result.name).toBe("החם הנסגר");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/admin-content.test.ts
```

Expected: FAIL because prompt/archetype admin modules do not exist.

- [ ] **Step 3: Implement prompt and archetype validation**

Create `src/domain/admin/prompt-admin.ts`:

```ts
import { z } from "zod";

const promptVersionSchema = z.object({
  template: z.string().min(1),
  model: z.string().min(1),
  modelSettings: z.record(z.unknown()),
});

export function validatePromptVersion(value: unknown) {
  const prompt = promptVersionSchema.parse(value);

  for (const variable of ["{{displayName}}", "{{answersJson}}", "{{archetypeName}}"] as const) {
    if (!prompt.template.includes(variable)) {
      throw new Error(`Prompt template must include ${variable}`);
    }
  }

  return prompt;
}
```

Create `src/domain/admin/archetype-admin.ts`:

```ts
import { z } from "zod";

const archetypeVersionSchema = z.object({
  name: z.string().min(1),
  shortDescription: z.string().min(1),
  fullDescription: z.string().min(1),
  matchingMeaning: z.string().min(1),
  scoringRules: z.record(z.unknown()),
});

export function validateArchetypeVersion(value: unknown) {
  return archetypeVersionSchema.parse(value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/unit/admin-content.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/admin/prompt-admin.ts src/domain/admin/archetype-admin.ts tests/unit/admin-content.test.ts
git commit -m "feat: add admin content validation"
```

## Task 4: Match Settings Admin Rules

**Files:**

- Create: `src/domain/admin/match-settings-admin.ts`
- Test: `tests/unit/admin-match-settings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/admin-match-settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeWeights, validateMatchSettings } from "../../src/domain/admin/match-settings-admin";

describe("match settings admin rules", () => {
  it("normalizes active weights to 100", () => {
    expect(normalizeWeights({ emotional_profile: 3, communication_style: 1 })).toEqual({
      emotional_profile: 75,
      communication_style: 25,
    });
  });

  it("rejects settings without active weights", () => {
    expect(() => validateMatchSettings({ weights: {}, hardFilters: ["gender_preference"] })).toThrow(
      "At least one active matching weight is required",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/admin-match-settings.test.ts
```

Expected: FAIL because match settings admin module does not exist.

- [ ] **Step 3: Implement match settings rules**

Create `src/domain/admin/match-settings-admin.ts`:

```ts
export function normalizeWeights(weights: Record<string, number>) {
  const entries = Object.entries(weights).filter(([, value]) => value > 0);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  if (total <= 0) {
    throw new Error("At least one active matching weight is required");
  }

  return Object.fromEntries(entries.map(([key, value]) => [key, Math.round((value / total) * 100)]));
}

export function validateMatchSettings(input: {
  weights: Record<string, number>;
  hardFilters: string[];
}) {
  return {
    weights: normalizeWeights(input.weights),
    hardFilters: input.hardFilters,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/unit/admin-match-settings.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/admin/match-settings-admin.ts tests/unit/admin-match-settings.test.ts
git commit -m "feat: add match settings admin rules"
```

## Task 5: Moderation Admin Rules

**Files:**

- Create: `src/domain/admin/moderation-admin.ts`
- Test: `tests/unit/admin-moderation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/admin-moderation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canDisableConversation, canDisableUser } from "../../src/domain/admin/moderation-admin";

describe("moderation admin rules", () => {
  it("allows disabling active conversations", () => {
    expect(canDisableConversation({ status: "active" })).toBe(true);
  });

  it("does not disable an already disabled conversation", () => {
    expect(canDisableConversation({ status: "disabled" })).toBe(false);
  });

  it("allows disabling enabled users", () => {
    expect(canDisableUser({ disabledAt: null })).toBe(true);
    expect(canDisableUser({ disabledAt: new Date("2026-06-02T00:00:00Z") })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/admin-moderation.test.ts
```

Expected: FAIL because moderation admin module does not exist.

- [ ] **Step 3: Implement moderation rules**

Create `src/domain/admin/moderation-admin.ts`:

```ts
export function canDisableConversation(input: { status: "active" | "blocked" | "disabled" }) {
  return input.status !== "disabled";
}

export function canDisableUser(input: { disabledAt: Date | null }) {
  return input.disabledAt === null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/unit/admin-moderation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/admin/moderation-admin.ts tests/unit/admin-moderation.test.ts
git commit -m "feat: add moderation admin rules"
```

## Task 6: Admin Navigation Pages

**Files:**

- Create: `src/app/admin/layout.tsx`
- Modify: `src/app/admin/page.tsx`
- Create: `src/app/admin/questionnaires/page.tsx`
- Create: `src/app/admin/archetypes/page.tsx`
- Create: `src/app/admin/prompts/page.tsx`
- Create: `src/app/admin/matching/page.tsx`
- Create: `src/app/admin/payments/page.tsx`
- Create: `src/app/admin/reports/page.tsx`
- Create: `src/app/admin/users/page.tsx`
- Create: `src/app/admin/moderation/page.tsx`
- Test: `tests/e2e/admin-navigation.spec.ts`

- [ ] **Step 1: Write the failing e2e test**

Create `tests/e2e/admin-navigation.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

const pages = [
  ["שאלונים", "/admin/questionnaires", "ניהול שאלונים"],
  ["ארכיטיפים", "/admin/archetypes", "ניהול ארכיטיפים"],
  ["פרומפטים", "/admin/prompts", "ניהול פרומפטים"],
  ["התאמות", "/admin/matching", "הגדרות התאמה"],
  ["תשלומים", "/admin/payments", "ניהול תשלומים"],
  ["דוחות", "/admin/reports", "ניהול דוחות"],
  ["משתמשים", "/admin/users", "ניהול משתמשים"],
  ["מודרציה", "/admin/moderation", "מודרציה"],
] as const;

test("admin navigation exposes all management areas", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "ניהול lovlov.me" })).toBeVisible();

  for (const [label] of pages) {
    await expect(page.getByRole("link", { name: label })).toBeVisible();
  }
});

for (const [, url, heading] of pages) {
  test(`admin page ${url} renders`, async ({ page }) => {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run e2e -- tests/e2e/admin-navigation.spec.ts
```

Expected: FAIL because admin subpages do not exist.

- [ ] **Step 3: Create admin layout and pages**

Create `src/app/admin/layout.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";

const links = [
  ["שאלונים", "/admin/questionnaires"],
  ["ארכיטיפים", "/admin/archetypes"],
  ["פרומפטים", "/admin/prompts"],
  ["התאמות", "/admin/matching"],
  ["תשלומים", "/admin/payments"],
  ["דוחות", "/admin/reports"],
  ["משתמשים", "/admin/users"],
  ["מודרציה", "/admin/moderation"],
] as const;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar" aria-label="ניווט ניהול">
        {links.map(([label, href]) => (
          <Link key={href} href={href}>{label}</Link>
        ))}
      </aside>
      <div className="admin-content">{children}</div>
    </div>
  );
}
```

Modify `src/app/admin/page.tsx`:

```tsx
export default function AdminPage() {
  return (
    <main>
      <h1>ניהול lovlov.me</h1>
      <p>בחרו אזור ניהול מהתפריט.</p>
    </main>
  );
}
```

Create these pages:

`src/app/admin/questionnaires/page.tsx`:

```tsx
export default function AdminQuestionnairesPage() {
  return <main><h1>ניהול שאלונים</h1><p>יצירה, עריכה ופרסום גרסאות שאלון.</p></main>;
}
```

`src/app/admin/archetypes/page.tsx`:

```tsx
export default function AdminArchetypesPage() {
  return <main><h1>ניהול ארכיטיפים</h1><p>ניהול 12 פרופילי הבסיס וגרסאותיהם.</p></main>;
}
```

`src/app/admin/prompts/page.tsx`:

```tsx
export default function AdminPromptsPage() {
  return <main><h1>ניהול פרומפטים</h1><p>עריכת תבניות AI וגרסאות פרסום.</p></main>;
}
```

`src/app/admin/matching/page.tsx`:

```tsx
export default function AdminMatchingPage() {
  return <main><h1>הגדרות התאמה</h1><p>משקלים, פילטרים קשיחים וגרסאות מנוע התאמה.</p></main>;
}
```

`src/app/admin/payments/page.tsx`:

```tsx
export default function AdminPaymentsPage() {
  return <main><h1>ניהול תשלומים</h1><p>צפייה בסטטוסי UPay, מזהים, וסשנים משויכים.</p></main>;
}
```

`src/app/admin/reports/page.tsx`:

```tsx
export default function AdminReportsPage() {
  return <main><h1>ניהול דוחות</h1><p>צפייה בדוחות, סטטוס יצירה, והרצת ניסיון חוזר.</p></main>;
}
```

`src/app/admin/users/page.tsx`:

```tsx
export default function AdminUsersPage() {
  return <main><h1>ניהול משתמשים</h1><p>צפייה בפרופילים, השלמת שאלונים, וחסימת משתמשים.</p></main>;
}
```

`src/app/admin/moderation/page.tsx`:

```tsx
export default function AdminModerationPage() {
  return <main><h1>מודרציה</h1><p>ניהול דיווחים, חסימות ושיחות מושבתות.</p></main>;
}
```

Add to `src/app/globals.css`:

```css
.admin-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 100vh;
}

.admin-sidebar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 24px;
  border-left: 1px solid #ded8d0;
  background: #ffffff;
}

.admin-sidebar a {
  color: #1f2937;
  text-decoration: none;
  padding: 8px 10px;
  border-radius: 8px;
}

.admin-sidebar a:hover {
  background: #f3f0eb;
}

.admin-content {
  padding: 32px;
}
```

- [ ] **Step 4: Run e2e test to verify it passes**

Run:

```bash
npm run e2e -- tests/e2e/admin-navigation.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin src/app/globals.css tests/e2e/admin-navigation.spec.ts
git commit -m "feat: add admin navigation pages"
```

## Task 7: Admin Server Action Contracts

**Files:**

- Create: `src/app/admin/actions/questionnaires.ts`
- Create: `src/app/admin/actions/prompts.ts`
- Create: `src/app/admin/actions/matching.ts`
- Test: `tests/unit/admin-actions-contract.test.ts`

- [ ] **Step 1: Write the failing action contract test**

Create `tests/unit/admin-actions-contract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildQuestionnairePublishAction } from "../../src/app/admin/actions/questionnaires";
import { buildPromptPublishAction } from "../../src/app/admin/actions/prompts";
import { buildMatchSettingsPublishAction } from "../../src/app/admin/actions/matching";

describe("admin action contracts", () => {
  it("builds questionnaire publish action", () => {
    expect(buildQuestionnairePublishAction("version-1", "admin-1")).toEqual({
      type: "questionnaire.publish",
      versionId: "version-1",
      actorUserId: "admin-1",
    });
  });

  it("builds prompt publish action", () => {
    expect(buildPromptPublishAction("prompt-version-1", "admin-1").type).toBe("prompt.publish");
  });

  it("builds match settings publish action", () => {
    expect(buildMatchSettingsPublishAction("settings-version-1", "admin-1").type).toBe("match_settings.publish");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/admin-actions-contract.test.ts
```

Expected: FAIL because action files do not exist.

- [ ] **Step 3: Implement action contract builders**

Create `src/app/admin/actions/questionnaires.ts`:

```ts
"use server";

export function buildQuestionnairePublishAction(versionId: string, actorUserId: string) {
  return { type: "questionnaire.publish" as const, versionId, actorUserId };
}
```

Create `src/app/admin/actions/prompts.ts`:

```ts
"use server";

export function buildPromptPublishAction(versionId: string, actorUserId: string) {
  return { type: "prompt.publish" as const, versionId, actorUserId };
}
```

Create `src/app/admin/actions/matching.ts`:

```ts
"use server";

export function buildMatchSettingsPublishAction(versionId: string, actorUserId: string) {
  return { type: "match_settings.publish" as const, versionId, actorUserId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/unit/admin-actions-contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/actions tests/unit/admin-actions-contract.test.ts
git commit -m "feat: add admin action contracts"
```

## Task 8: Phase 2 Verification

**Files:**

- Modify: none unless verification fails.

- [ ] **Step 1: Run all unit tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Run admin e2e tests**

Run:

```bash
npm run e2e -- tests/e2e/admin-navigation.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Manual browser checks**

Open:

- `http://localhost:3000/admin`
- `http://localhost:3000/admin/questionnaires`
- `http://localhost:3000/admin/archetypes`
- `http://localhost:3000/admin/prompts`
- `http://localhost:3000/admin/matching`
- `http://localhost:3000/admin/payments`
- `http://localhost:3000/admin/reports`
- `http://localhost:3000/admin/users`
- `http://localhost:3000/admin/moderation`

Expected: every page renders RTL Hebrew content and the admin navigation remains visible.

## Self-Review Notes

Spec coverage:

- Questionnaire CRUD rules: covered by Task 2.
- Version/publish workflow contracts: covered by Tasks 2 and 7.
- Archetype management: covered by Task 3 and navigation page.
- Prompt management: covered by Task 3 and navigation page.
- Match settings: covered by Task 4 and navigation page.
- Payments/reports/users/moderation admin surfaces: covered by Task 6 shell pages.
- Audit/admin role: covered by Task 1.

Known follow-up after this phase: replace shell pages with real Supabase-backed list/edit forms, using the validation and action contracts from this plan.
