# Hebrew Platform Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove mojibake and English visible copy, verify Hebrew RTL behavior, and harden the full user/admin experience with responsive UI and end-to-end coverage.

**Architecture:** Add automated copy scanning and focused UI tests, then polish public and admin surfaces in small batches. Use browser screenshot QA at mobile and desktop widths for every changed route, and extend Playwright coverage across the paid user funnel plus admin configuration, matching rerun, and recovery operations.

**Tech Stack:** Next.js App Router, TypeScript, React Testing Library, Playwright, Vitest, simple Node/TSX scanning scripts.

---

## Scope Boundary

This milestone includes:

- Removing visible mojibake.
- Replacing English user-facing copy with Hebrew.
- Verifying RTL on public and admin layouts.
- Improving responsive layout, empty states, loading states, validation copy, and failure states.
- Adding E2E coverage for user and admin paths.
- Capturing browser screenshots for critical routes.

This milestone does not include:

- New product capabilities.
- New database schema except test fixture helpers when needed.
- Reworking the brand identity beyond fixing readability and consistency.

## Files

Create:

- `scripts/scan-visible-copy.ts`: scans source files for mojibake and obvious English JSX/API messages.
- `tests/unit/visible-copy-scan.test.ts`: enforces the scan.
- `tests/e2e/full-user-admin-flow.spec.ts`: paid user and admin critical path.
- `tests/e2e/rtl-visual-smoke.spec.ts`: route-level RTL and screenshot smoke.
- `docs/qa/2026-06-06-hebrew-platform-polish.md`: QA notes and screenshot inventory.

Modify likely:

- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/app/page.tsx`
- `src/app/quiz/page.tsx`
- `src/app/quiz/quiz-wizard.tsx`
- `src/app/report/[token]/page.tsx`
- `src/app/register/page.tsx`
- `src/app/register/register-claim-form.tsx`
- `src/app/login/page.tsx`
- `src/app/login/login-form.tsx`
- `src/app/profile/matching/page.tsx`
- `src/app/profile/matching/matching-profile-form.tsx`
- `src/app/matching/questionnaire/page.tsx`
- `src/app/matches/page.tsx`
- `src/app/chat/[conversationId]/page.tsx`
- `src/app/chat/[conversationId]/chat-thread.tsx`
- `src/app/admin/layout.tsx`
- `src/app/admin/page.tsx`
- `src/app/admin/**/page.tsx`
- `src/app/api/**/route.ts` where API messages are visible in the browser.
- Existing unit tests whose assertions include old English copy.

## Task 1: Add Visible Copy Scanner

**Files:**

- Create: `scripts/scan-visible-copy.ts`
- Create: `tests/unit/visible-copy-scan.test.ts`

- [ ] **Step 1: Write failing scanner test**

Create `tests/unit/visible-copy-scan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scanVisibleCopy } from "../../scripts/scan-visible-copy";

describe("visible copy scan", () => {
  it("finds mojibake and English visible copy", async () => {
    const findings = await scanVisibleCopy({
      roots: ["src/app"],
      allowList: [
        "ok",
        "code",
        "data",
        "error",
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "NextResponse",
      ],
    });

    expect(findings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to see current findings**

Run:

```bash
npm test -- tests/unit/visible-copy-scan.test.ts
```

Expected: FAIL with a list of current mojibake or English visible-copy findings.

- [ ] **Step 3: Implement scanner**

Create `scripts/scan-visible-copy.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";

export type VisibleCopyFinding = {
  file: string;
  line: number;
  reason: "mojibake" | "english_visible_copy";
  text: string;
};

const sourceExtensions = new Set([".tsx", ".ts"]);
const mojibakePattern = /(?:×|�|Ã|Â)/;
const englishPhrasePattern = />[^<]*[A-Za-z]{4,}[^<]*<|message:\s*["'`][^"'`]*[A-Za-z]{4,}/;

export async function scanVisibleCopy(input: { roots: string[]; allowList: string[] }) {
  const files = (await Promise.all(input.roots.map((root) => collectFiles(root)))).flat();
  const findings: VisibleCopyFinding[] = [];

  for (const file of files) {
    const text = await fs.readFile(file, "utf8");
    const lines = text.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (mojibakePattern.test(line)) {
        findings.push({ file, line: index + 1, reason: "mojibake", text: line.trim() });
      }

      if (englishPhrasePattern.test(line) && !input.allowList.some((allowed) => line.includes(allowed))) {
        findings.push({ file, line: index + 1, reason: "english_visible_copy", text: line.trim() });
      }
    });
  }

  return findings;
}

async function collectFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(fullPath);
      }
      return sourceExtensions.has(path.extname(entry.name)) ? [fullPath] : [];
    }),
  );

  return files.flat();
}
```

- [ ] **Step 4: Run scanner test**

Run:

```bash
npm test -- tests/unit/visible-copy-scan.test.ts
```

Expected: FAIL until subsequent tasks fix findings. Keep the failure output for the cleanup list.

- [ ] **Step 5: Commit scanner**

```bash
git add scripts/scan-visible-copy.ts tests/unit/visible-copy-scan.test.ts
git commit -m "test: add visible copy scanner"
```

## Task 2: Fix Public Hebrew And RTL Copy

**Files:**

- Modify public pages and components listed in the Files section.
- Modify visible API messages in public route handlers.
- Test: `tests/unit/visible-copy-scan.test.ts`

- [ ] **Step 1: Generate findings**

Run:

```bash
npm test -- tests/unit/visible-copy-scan.test.ts
```

Expected: FAIL with public files containing mojibake or English visible copy.

- [ ] **Step 2: Fix app layout metadata**

Modify `src/app/layout.tsx`:

```tsx
export const metadata = {
  title: "LovLov",
  description: "שאלון התאמה ודוח אישי בעברית",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
```

Preserve existing providers/classes when applying this change.

- [ ] **Step 3: Replace public page copy**

Use these target strings where the current UI still has English or mojibake:

- Home heading: `LovLov`
- Quiz start: `התחלת שאלון`
- Quiz next: `המשך`
- Quiz back: `חזרה`
- Quiz completion: `סיום ומעבר לתשלום`
- Payment pending: `אנחנו מאשרים את התשלום`
- Report loading: `הדוח נטען`
- Register heading: `יצירת חשבון`
- Login heading: `כניסה לחשבון`
- Matching questionnaire heading: `שאלון עומק להתאמות`
- Matches heading: `ההתאמות שלך`
- Empty matches: `עדיין אין התאמות פעילות. נעדכן כשיהיו התאמות חדשות.`
- Chat heading: `שיחה`
- Chat input placeholder: `כתבו הודעה`
- Send button: `שליחה`

- [ ] **Step 4: Replace public API messages**

For public route handlers, visible failures use Hebrew envelope messages:

```ts
apiError(401, "authentication_required", "צריך להתחבר כדי להמשיך.");
apiError(400, "validation_failed", "הנתונים שנשלחו אינם תקינים.");
apiError(404, "not_found", "העמוד או הרשומה לא נמצאו.");
apiError(500, "server_error", "אירעה תקלה. נסו שוב בעוד רגע.");
```

- [ ] **Step 5: Run public tests**

Run:

```bash
npm test -- tests/unit/visible-copy-scan.test.ts tests/unit/login-page.test.tsx tests/unit/login-form.test.tsx tests/unit/register-page.test.tsx tests/unit/payment-return-page.test.tsx tests/unit/unauthenticated-login-links.test.tsx
```

Expected: PASS for updated public copy tests.

- [ ] **Step 6: Commit**

```bash
git add src/app scripts/scan-visible-copy.ts tests/unit
git commit -m "fix: polish public hebrew copy"
```

## Task 3: Fix Admin Hebrew And RTL Copy

**Files:**

- Modify `src/app/admin/layout.tsx`
- Modify `src/app/admin/**/page.tsx`
- Modify `src/app/admin/**/*.tsx`
- Test: `tests/unit/visible-copy-scan.test.ts`

- [ ] **Step 1: Run scanner**

Run:

```bash
npm test -- tests/unit/visible-copy-scan.test.ts
```

Expected: FAIL if admin pages still contain mojibake or visible English.

- [ ] **Step 2: Standardize admin navigation**

Use these labels in `src/app/admin/layout.tsx`:

- `סקירה`
- `שאלונים`
- `פרומפטים`
- `ארכיטיפים`
- `הגדרות התאמה`
- `פרופיל התאמות`
- `תשלומים`
- `דוחות`
- `משתמשים`
- `מודרציה`

- [ ] **Step 3: Standardize admin page states**

Use these shared Hebrew state strings:

- Loading: `הנתונים נטענים`
- Empty: `אין רשומות להצגה`
- Save: `שמירה`
- Saved: `השינויים נשמרו`
- Publish: `פרסום`
- Archive: `ארכוב`
- Retry: `ניסיון חוזר`
- Disable: `השבתה`
- Enable: `הפעלה מחדש`
- Validation failure: `בדקו את השדות המסומנים ונסו שוב.`
- Server failure: `אירעה תקלה בפעולת המנהל.`

- [ ] **Step 4: Run admin tests**

Run:

```bash
npm test -- tests/unit/visible-copy-scan.test.ts tests/unit/admin-page-guard.test.ts tests/unit/admin-actions-contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin tests/unit/visible-copy-scan.test.ts tests/unit/admin-page-guard.test.ts tests/unit/admin-actions-contract.test.ts
git commit -m "fix: polish admin hebrew copy"
```

## Task 4: Improve Responsive UI States

**Files:**

- Modify `src/app/globals.css`
- Modify public/admin components with overflow or weak states.
- Test: `tests/e2e/rtl-visual-smoke.spec.ts`

- [ ] **Step 1: Add visual smoke test**

Create `tests/e2e/rtl-visual-smoke.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/quiz",
  "/login",
  "/register",
  "/profile/matching",
  "/matches",
  "/admin",
  "/admin/questionnaires",
  "/admin/matching",
  "/admin/payments",
  "/admin/reports",
];

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 1000 },
]) {
  test.describe(`rtl visual smoke ${viewport.width}`, () => {
    test.use({ viewport });

    for (const route of routes) {
      test(`${route} is rtl and has no horizontal overflow`, async ({ page }) => {
        await page.goto(route);
        await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
        expect(overflow).toBe(false);
      });
    }
  });
}
```

- [ ] **Step 2: Run visual smoke**

Run:

```bash
npm run e2e -- tests/e2e/rtl-visual-smoke.spec.ts
```

Expected: FAIL on routes with auth fixture gaps or horizontal overflow.

- [ ] **Step 3: Fix layout primitives**

Modify `src/app/globals.css` and shared wrappers:

```css
html {
  direction: rtl;
}

body {
  margin: 0;
  overflow-x: hidden;
}

button,
input,
select,
textarea {
  font: inherit;
}

table {
  width: 100%;
}
```

Use responsive wrappers for wide admin tables:

```tsx
<div className="overflow-x-auto">
  <table className="min-w-[720px]">...</table>
</div>
```

- [ ] **Step 4: Fix empty/loading/error states**

For each critical page, add a visible Hebrew state:

- Empty list uses `אין רשומות להצגה` or a domain-specific Hebrew sentence.
- Loading uses `הנתונים נטענים`.
- Error uses API `message` or `אירעה תקלה. נסו שוב בעוד רגע.`
- Disabled submit buttons keep stable width and do not shift layout.

- [ ] **Step 5: Run visual smoke again**

Run:

```bash
npm run e2e -- tests/e2e/rtl-visual-smoke.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/app tests/e2e/rtl-visual-smoke.spec.ts
git commit -m "fix: improve rtl responsive states"
```

## Task 5: Add Full User/Admin E2E Coverage

**Files:**

- Create: `tests/e2e/full-user-admin-flow.spec.ts`
- Modify test fixtures as needed under `tests/e2e` and `src/testing`.

- [ ] **Step 1: Write full-flow E2E**

Create `tests/e2e/full-user-admin-flow.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("paid user reaches matches and admin can rerun matching", async ({ page }) => {
  await page.goto("/quiz");
  await expect(page.getByRole("heading")).toBeVisible();

  await page.goto("/profile/matching");
  await expect(page.getByRole("heading", { name: "פרופיל התאמות" })).toBeVisible();

  await page.goto("/matching/questionnaire");
  await expect(page.getByRole("heading", { name: "שאלון עומק להתאמות" })).toBeVisible();

  await page.goto("/matches");
  await expect(page.getByRole("heading", { name: "ההתאמות שלך" })).toBeVisible();

  await page.goto("/admin/matching");
  await expect(page.getByRole("heading", { name: "הגדרות התאמה" })).toBeVisible();
  await expect(page.getByRole("button", { name: "חישוב מחדש לכל המשתמשים" })).toBeVisible();
});
```

- [ ] **Step 2: Run full-flow E2E**

Run:

```bash
npm run e2e -- tests/e2e/full-user-admin-flow.spec.ts
```

Expected: FAIL until fixtures cover the complete flow.

- [ ] **Step 3: Extend fixtures**

Use existing helpers in:

- `tests/e2e/admin-auth.ts`
- `src/testing/e2e-chat-fixture.ts`
- `src/lib/e2e-mode.ts`

Add fixture data for:

- Paid quiz/report claim.
- Authenticated user with complete matching profile.
- Completed depth questionnaire.
- At least one eligible candidate.
- Admin role user.
- Published profile-form config.
- Published match settings.

- [ ] **Step 4: Run full-flow E2E**

Run:

```bash
npm run e2e -- tests/e2e/full-user-admin-flow.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/full-user-admin-flow.spec.ts tests/e2e src/testing src/lib/e2e-mode.ts
git commit -m "test: add full user admin flow"
```

## Task 6: Screenshot QA And Documentation

**Files:**

- Create: `docs/qa/2026-06-06-hebrew-platform-polish.md`
- Screenshots under existing `screenshots/` directory.

- [ ] **Step 1: Capture screenshots**

Run dev server:

```bash
npm run dev
```

Capture mobile and desktop screenshots for:

- `/`
- `/quiz`
- `/report/<valid-token>`
- `/register`
- `/login`
- `/profile/matching`
- `/matching/questionnaire`
- `/matches`
- `/chat/<conversation-id>`
- `/admin`
- `/admin/questionnaires`
- `/admin/prompts`
- `/admin/archetypes`
- `/admin/matching`
- `/admin/profile-form`
- `/admin/payments`
- `/admin/reports`
- `/admin/users`
- `/admin/moderation`

Expected: Save images in `screenshots/2026-06-06-hebrew-platform-polish/`.

- [ ] **Step 2: Document QA results**

Create `docs/qa/2026-06-06-hebrew-platform-polish.md`:

```md
# Hebrew Platform Polish QA

Date: 2026-06-06

## Commands

- `npm test`
- `npm run build`
- `npm run e2e -- tests/e2e/rtl-visual-smoke.spec.ts`
- `npm run e2e -- tests/e2e/full-user-admin-flow.spec.ts`

## Screenshot Inventory

- Mobile and desktop screenshots captured under `screenshots/2026-06-06-hebrew-platform-polish/`.

## Findings

- No mojibake found by `tests/unit/visible-copy-scan.test.ts`.
- Public and admin layouts render with `dir="rtl"`.
- Critical pages have Hebrew loading, empty, validation, and error states.
```

- [ ] **Step 3: Run final commands**

Run:

```bash
npm test
npm run build
npm run e2e -- tests/e2e/rtl-visual-smoke.spec.ts tests/e2e/full-user-admin-flow.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/qa/2026-06-06-hebrew-platform-polish.md screenshots/2026-06-06-hebrew-platform-polish
git commit -m "docs: add hebrew polish qa evidence"
```

## Acceptance Gates

- [ ] `npm test -- tests/unit/visible-copy-scan.test.ts`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run e2e -- tests/e2e/rtl-visual-smoke.spec.ts`
- [ ] `npm run e2e -- tests/e2e/full-user-admin-flow.spec.ts`
- [ ] Browser screenshots exist for critical public and admin pages at mobile and desktop widths.
- [ ] No mojibake appears in source scan or screenshots.
- [ ] Public and admin layouts use RTL.
