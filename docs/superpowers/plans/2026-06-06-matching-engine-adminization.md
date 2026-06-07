# Matching Engine Adminization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make published admin match-settings versions control matching weights, hard filters, deal-breaker behavior, and rerun operations.

**Architecture:** Introduce a server-only matching settings repository and rerun service that loads the currently published version, validates it through admin/domain rules, recalculates matches deterministically, and writes the exact `match_settings_version_id` onto every recalculated match. Admin REST routes manage versions and enqueue or execute one-user/global reruns with audit logs.

**Tech Stack:** Next.js App Router REST routes, TypeScript domain services, Supabase service-role client, existing `matches` and `match_settings_versions` tables, Vitest, Playwright.

---

## Scope Boundary

This milestone includes:

- Published match-settings lookup.
- Scoring weights loaded from published settings instead of hardcoded defaults.
- Configurable hard filters and deal-breaker participation.
- Admin REST APIs for match-settings version CRUD, publish/archive, and rerun operations.
- Admin UI for weights, hard filters, deal breakers, one-user rerun, and global rerun.
- Tests that prove matches store the settings version used.

This milestone does not include:

- New questionnaire trait derivation.
- Machine-learning ranking.
- Background job infrastructure beyond a synchronous service or a bounded server route.

## Files

Create:

- `src/domain/matching/settings.ts`: published settings types, defaults, parsing, and validation.
- `src/domain/matching/settings-repository.ts`: Supabase published-settings loader.
- `src/domain/matching/rerun.ts`: one-user and global rerun service.
- `src/app/api/admin/matching/settings/route.ts`: admin list/create route.
- `src/app/api/admin/matching/settings/[versionId]/route.ts`: admin read/update route.
- `src/app/api/admin/matching/settings/[versionId]/publish/route.ts`: publish route.
- `src/app/api/admin/matching/settings/[versionId]/archive/route.ts`: archive route.
- `src/app/api/admin/matching/rerun/route.ts`: rerun route.
- `tests/unit/matching-settings-published.test.ts`
- `tests/unit/matching-rerun.test.ts`
- `tests/unit/admin-matching-rest.test.ts`
- `tests/e2e/admin-matching-rerun.spec.ts`

Modify:

- `src/domain/matching/scoring.ts`: accept settings object and configurable hard filters.
- `src/domain/matching/types.ts`: include settings and explanation version fields.
- `src/app/api/matching/sessions/[token]/complete/route.ts`: trigger one-user rerun after depth questionnaire completion.
- `src/app/matches/matches-loader.ts`: surface settings version when useful for admin/debug tests.
- `src/app/admin/matching/page.tsx`: use REST-backed data and rerun controls.
- `src/app/admin/matching/[versionId]/match-settings-editor.tsx`: edit weights, hard filters, deal-breaker behavior.
- `src/domain/admin/match-settings-admin.ts`: validate expanded settings.
- `tests/unit/matching.test.ts`
- `tests/unit/admin-match-settings.test.ts`
- `tests/unit/matching-complete-route.test.ts`

## Task 1: Model Published Match Settings

**Files:**

- Create: `src/domain/matching/settings.ts`
- Modify: `src/domain/admin/match-settings-admin.ts`
- Test: `tests/unit/matching-settings-published.test.ts`
- Test: `tests/unit/admin-match-settings.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/matching-settings-published.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parsePublishedMatchSettings } from "../../src/domain/matching/settings";

describe("published match settings", () => {
  it("normalizes published settings with version id", () => {
    expect(
      parsePublishedMatchSettings({
        id: "settings-v2",
        weights: { emotional_profile: 50, communication_style: 30, commitment_readiness: 10, relationship_vision: 10 },
        hard_filters: ["gender", "age_range", "distance", "relationship_intention", "deal_breakers"],
        deal_breaker_filters: ["smoking", "substance_use"],
      }),
    ).toEqual({
      ok: true,
      value: {
        versionId: "settings-v2",
        weights: { emotional_profile: 50, communication_style: 30, commitment_readiness: 10, relationship_vision: 10 },
        hardFilters: ["gender", "age_range", "distance", "relationship_intention", "deal_breakers"],
        dealBreakerFilters: ["smoking", "substance_use"],
      },
    });
  });

  it("rejects settings with no active weights", () => {
    expect(
      parsePublishedMatchSettings({
        id: "settings-v3",
        weights: { emotional_profile: 0 },
        hard_filters: [],
      }),
    ).toEqual({
      ok: false,
      errors: [{ code: "weights_required", message: "לפחות משקל התאמה אחד חייב להיות פעיל." }],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/matching-settings-published.test.ts
```

Expected: FAIL because the settings module does not exist.

- [ ] **Step 3: Implement settings parser**

Create `src/domain/matching/settings.ts`:

```ts
import type { MatchingTraitKey } from "./types";

export type MatchingHardFilterKey = "gender" | "age_range" | "distance" | "relationship_intention" | "deal_breakers";

export type PublishedMatchSettings = {
  versionId: string;
  weights: Record<MatchingTraitKey, number>;
  hardFilters: MatchingHardFilterKey[];
  dealBreakerFilters: string[];
};

export function parsePublishedMatchSettings(input: {
  id: string;
  weights: Record<string, unknown>;
  hard_filters: unknown;
  deal_breaker_filters?: unknown;
}): { ok: true; value: PublishedMatchSettings } | { ok: false; errors: { code: string; message: string }[] } {
  const weights = Object.fromEntries(
    Object.entries(input.weights ?? {}).map(([key, value]) => [key, Number(value)]),
  ) as Record<MatchingTraitKey, number>;
  const activeWeightTotal = Object.values(weights).reduce((sum, value) => sum + (value > 0 ? value : 0), 0);

  if (activeWeightTotal <= 0) {
    return { ok: false, errors: [{ code: "weights_required", message: "לפחות משקל התאמה אחד חייב להיות פעיל." }] };
  }

  return {
    ok: true,
    value: {
      versionId: input.id,
      weights,
      hardFilters: Array.isArray(input.hard_filters) ? (input.hard_filters as MatchingHardFilterKey[]) : [],
      dealBreakerFilters: Array.isArray(input.deal_breaker_filters) ? input.deal_breaker_filters.map(String) : [],
    },
  };
}
```

- [ ] **Step 4: Expand admin validation**

Modify `src/domain/admin/match-settings-admin.ts` so `validateMatchSettings` accepts:

```ts
{
  weights: Record<string, number>;
  hardFilters: MatchingHardFilterKey[];
  dealBreakerFilters: string[];
}
```

Reject unknown hard filter keys with:

```ts
throw new Error("Unknown matching hard filter");
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- tests/unit/matching-settings-published.test.ts tests/unit/admin-match-settings.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/matching/settings.ts src/domain/admin/match-settings-admin.ts tests/unit/matching-settings-published.test.ts tests/unit/admin-match-settings.test.ts
git commit -m "feat: model published match settings"
```

## Task 2: Load Published Settings From Supabase

**Files:**

- Create: `src/domain/matching/settings-repository.ts`
- Test: `tests/unit/matching-settings-published.test.ts`

- [ ] **Step 1: Add repository test**

Append to `tests/unit/matching-settings-published.test.ts`:

```ts
import { loadPublishedMatchSettings } from "../../src/domain/matching/settings-repository";

it("loads the published settings version", async () => {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: {
                id: "settings-v2",
                weights: { emotional_profile: 100 },
                hard_filters: ["gender"],
                deal_breaker_filters: ["smoking"],
              },
              error: null,
            }),
        }),
      }),
    }),
  };

  await expect(loadPublishedMatchSettings(supabase)).resolves.toMatchObject({
    versionId: "settings-v2",
    weights: { emotional_profile: 100 },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/matching-settings-published.test.ts
```

Expected: FAIL because the repository does not exist.

- [ ] **Step 3: Implement repository**

Create `src/domain/matching/settings-repository.ts`:

```ts
import { parsePublishedMatchSettings, type PublishedMatchSettings } from "./settings";

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: <T>() => Promise<{ data: T | null; error: { message?: string } | null }>;
      };
    };
  };
};

type MatchSettingsRow = {
  id: string;
  weights: Record<string, unknown>;
  hard_filters: unknown;
  deal_breaker_filters?: unknown;
};

export async function loadPublishedMatchSettings(supabase: SupabaseLike): Promise<PublishedMatchSettings> {
  const { data, error } = await supabase
    .from("match_settings_versions")
    .select("id, weights, hard_filters, deal_breaker_filters")
    .eq("status", "published")
    .maybeSingle<MatchSettingsRow>();

  if (error) {
    throw new Error(error.message ?? "Published match settings could not be loaded");
  }

  if (!data) {
    throw new Error("Published match settings are missing");
  }

  const parsed = parsePublishedMatchSettings(data);

  if (!parsed.ok) {
    throw new Error(parsed.errors.map((item) => item.message).join(" "));
  }

  return parsed.value;
}
```

- [ ] **Step 4: Run repository tests**

Run:

```bash
npm test -- tests/unit/matching-settings-published.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/matching/settings-repository.ts tests/unit/matching-settings-published.test.ts
git commit -m "feat: load published match settings"
```

## Task 3: Make Scoring Consume Configurable Settings

**Files:**

- Modify: `src/domain/matching/scoring.ts`
- Modify: `src/domain/matching/types.ts`
- Test: `tests/unit/matching.test.ts`

- [ ] **Step 1: Add failing scoring test**

Append to `tests/unit/matching.test.ts`:

```ts
it("stores scores using admin-published weights", () => {
  const matches = generateMatchesForProfile({
    profile: profileA,
    candidates: [profileB],
    settings: {
      versionId: "settings-v2",
      weights: { emotional_profile: 100, communication_style: 0, commitment_readiness: 0, relationship_vision: 0 },
      hardFilters: ["gender", "age_range", "distance", "relationship_intention", "deal_breakers"],
      dealBreakerFilters: ["smoking"],
    },
  });

  expect(matches[0]).toMatchObject({
    matchSettingsVersionId: "settings-v2",
    explanation: { settingsVersionId: "settings-v2" },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/matching.test.ts
```

Expected: FAIL because `generateMatchesForProfile` does not accept `settings`.

- [ ] **Step 3: Update types**

Modify `src/domain/matching/types.ts`:

```ts
export type GeneratedMatch = {
  userA: string;
  userB: string;
  score: number;
  matchSettingsVersionId: string;
  explanation: {
    settingsVersionId: string;
    summary: string;
    traitScores: Record<MatchingTraitKey, number>;
  };
};
```

- [ ] **Step 4: Update scoring**

Modify `src/domain/matching/scoring.ts` so input is:

```ts
export function generateMatchesForProfile(input: {
  profile: MatchProfile;
  candidates: MatchProfile[];
  settings?: PublishedMatchSettings;
}): GeneratedMatch[] {
  const settings = input.settings ?? {
    versionId: "default",
    weights: DEFAULT_MATCHING_WEIGHTS,
    hardFilters: ["gender", "age_range", "distance", "relationship_intention", "deal_breakers"],
    dealBreakerFilters: ["smoking", "wants_children_mismatch", "religion_values_mismatch", "political_values_mismatch", "pets_mismatch", "substance_use", "financial_instability", "long_distance"],
  };
```

Use `settings.weights` for scores and `settings.hardFilters` inside `passesHardFilters`.

- [ ] **Step 5: Run scoring tests**

Run:

```bash
npm test -- tests/unit/matching.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/matching/scoring.ts src/domain/matching/types.ts tests/unit/matching.test.ts
git commit -m "feat: use admin match settings in scoring"
```

## Task 4: Add Matching Rerun Service

**Files:**

- Create: `src/domain/matching/rerun.ts`
- Test: `tests/unit/matching-rerun.test.ts`

- [ ] **Step 1: Write rerun tests**

Create `tests/unit/matching-rerun.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { rerunMatchesForUser } from "../../src/domain/matching/rerun";

describe("matching rerun", () => {
  it("upserts matches with the exact settings version", async () => {
    const upsert = vi.fn(() => Promise.resolve({ error: null }));
    const supabase = {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
        upsert,
        delete: vi.fn(() => ({ or: vi.fn(() => Promise.resolve({ error: null })) })),
      })),
    };

    const result = await rerunMatchesForUser({
      supabase,
      userId: "user-a",
      settings: {
        versionId: "settings-v2",
        weights: { emotional_profile: 100, communication_style: 0, commitment_readiness: 0, relationship_vision: 0 },
        hardFilters: [],
        dealBreakerFilters: [],
      },
      profiles: [completeProfile("user-a", 80), completeProfile("user-b", 90)],
    });

    expect(result).toEqual({ recalculated: 1, settingsVersionId: "settings-v2" });
    expect(upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ match_settings_version_id: "settings-v2" }),
      ]),
      { onConflict: "user_a,user_b" },
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/matching-rerun.test.ts
```

Expected: FAIL because rerun service does not exist.

- [ ] **Step 3: Implement rerun service**

Create `src/domain/matching/rerun.ts`:

```ts
import { generateMatchesForProfile } from "./scoring";
import type { MatchProfile } from "./types";
import type { PublishedMatchSettings } from "./settings";

type SupabaseLike = {
  from: (table: string) => {
    upsert?: (rows: unknown[], options: { onConflict: string }) => Promise<{ error: { message?: string } | null }>;
    delete?: () => { or: (filter: string) => Promise<{ error: { message?: string } | null }> };
  };
};

export async function rerunMatchesForUser(input: {
  supabase: SupabaseLike;
  userId: string;
  settings: PublishedMatchSettings;
  profiles: MatchProfile[];
}) {
  const profile = input.profiles.find((item) => item.userId === input.userId);

  if (!profile) {
    return { recalculated: 0, settingsVersionId: input.settings.versionId };
  }

  const generated = generateMatchesForProfile({
    profile,
    candidates: input.profiles,
    settings: input.settings,
  });

  const rows = generated.map((match) => ({
    user_a: match.userA,
    user_b: match.userB,
    score: match.score,
    status: "active",
    match_settings_version_id: match.matchSettingsVersionId,
    calculated_at: new Date().toISOString(),
  }));

  if (rows.length) {
    const { error } = await input.supabase.from("matches").upsert?.(rows, { onConflict: "user_a,user_b" })!;
    if (error) {
      throw new Error(error.message ?? "Match rerun failed");
    }
  }

  return { recalculated: rows.length, settingsVersionId: input.settings.versionId };
}
```

- [ ] **Step 4: Add production profile loader**

Extend `src/domain/matching/rerun.ts` with `loadMatchProfiles(supabase)` that selects:

- `profiles.user_id`
- `profiles.birth_year`
- `profiles.gender`
- `profiles.interested_in`
- `profiles.relationship_intention`
- `profiles.location_text`
- `profiles.location_latitude`
- `profiles.location_longitude`
- `profiles.preferred_age_min`
- `profiles.preferred_age_max`
- `profiles.preferred_distance_km`
- `profiles.disabled_at`
- `profile_traits.trait_key`
- `profile_traits.numeric_value`
- `profile_deal_breakers.normalized_key`
- `user_blocks.blocker_id`
- `user_blocks.blocked_user_id`

- [ ] **Step 5: Run rerun tests**

Run:

```bash
npm test -- tests/unit/matching-rerun.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/matching/rerun.ts tests/unit/matching-rerun.test.ts
git commit -m "feat: add matching rerun service"
```

## Task 5: Add Admin Matching REST APIs

**Files:**

- Create: `src/app/api/admin/matching/settings/route.ts`
- Create: `src/app/api/admin/matching/settings/[versionId]/route.ts`
- Create: `src/app/api/admin/matching/settings/[versionId]/publish/route.ts`
- Create: `src/app/api/admin/matching/settings/[versionId]/archive/route.ts`
- Create: `src/app/api/admin/matching/rerun/route.ts`
- Test: `tests/unit/admin-matching-rest.test.ts`

- [ ] **Step 1: Write REST tests**

Create `tests/unit/admin-matching-rest.test.ts` with assertions:

```ts
expect(forbidden.status).toBe(403);
await expect(forbidden.json()).resolves.toMatchObject({
  ok: false,
  code: "forbidden",
  message: "אין לך הרשאת מנהל.",
});

expect(rerun.status).toBe(200);
await expect(rerun.json()).resolves.toMatchObject({
  ok: true,
  data: { recalculated: 1, settingsVersionId: "settings-v2" },
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/admin-matching-rest.test.ts
```

Expected: FAIL because the routes do not exist.

- [ ] **Step 3: Implement REST routes**

Use the shared envelope and admin auth helper. The rerun request body is:

```ts
type RerunRequest =
  | { scope: "user"; userId: string }
  | { scope: "global" };
```

Responses:

```ts
apiOk({ recalculated, settingsVersionId });
apiError(400, "invalid_rerun_request", "בקשת חישוב ההתאמות אינה תקינה.");
apiError(503, "published_settings_missing", "אין גרסת הגדרות התאמה מפורסמת.");
```

Every mutation writes `admin_audit_logs` with:

- `matching.settings.create_draft`
- `matching.settings.update_draft`
- `matching.settings.publish`
- `matching.settings.archive`
- `matching.rerun_user`
- `matching.rerun_global`

- [ ] **Step 4: Run REST tests**

Run:

```bash
npm test -- tests/unit/admin-matching-rest.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/matching tests/unit/admin-matching-rest.test.ts
git commit -m "feat: add admin matching rest api"
```

## Task 6: Trigger Rerun On Depth Questionnaire Completion

**Files:**

- Modify: `src/app/api/matching/sessions/[token]/complete/route.ts`
- Test: `tests/unit/matching-complete-route.test.ts`

- [ ] **Step 1: Add route test**

In `tests/unit/matching-complete-route.test.ts`, assert a completed questionnaire loads published settings and reruns for the current user:

```ts
expect(loadPublishedMatchSettings).toHaveBeenCalled();
expect(rerunMatchesForUser).toHaveBeenCalledWith(expect.objectContaining({
  userId: "user-1",
  settings: expect.objectContaining({ versionId: "settings-v2" }),
}));
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/matching-complete-route.test.ts
```

Expected: FAIL because completion does not trigger rerun.

- [ ] **Step 3: Implement completion hook**

Modify `src/app/api/matching/sessions/[token]/complete/route.ts` after traits and completion timestamp are saved:

```ts
const settings = await loadPublishedMatchSettings(supabase);
const profiles = await loadMatchProfiles(supabase);
await rerunMatchesForUser({ supabase, userId, settings, profiles });
```

Return a Hebrew warning in `data.matchingRerun` if rerun fails while the questionnaire completion has already succeeded:

```ts
matchingRerun: { ok: false, message: "השאלון נשמר, אבל חישוב ההתאמות יושלם בהמשך." }
```

- [ ] **Step 4: Run route test**

Run:

```bash
npm test -- tests/unit/matching-complete-route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/matching/sessions/[token]/complete/route.ts tests/unit/matching-complete-route.test.ts
git commit -m "feat: rerun matches after depth questionnaire"
```

## Task 7: Update Admin Matching UI

**Files:**

- Modify: `src/app/admin/matching/page.tsx`
- Modify: `src/app/admin/matching/[versionId]/page.tsx`
- Modify: `src/app/admin/matching/[versionId]/match-settings-editor.tsx`
- E2E: `tests/e2e/admin-matching-rerun.spec.ts`

- [ ] **Step 1: Add E2E test**

Create `tests/e2e/admin-matching-rerun.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("admin publishes match settings and starts rerun", async ({ page }) => {
  await page.goto("/admin/matching");
  await expect(page.getByRole("heading", { name: "הגדרות התאמה" })).toBeVisible();
  await expect(page.getByRole("button", { name: "חישוב מחדש לכל המשתמשים" })).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run e2e -- tests/e2e/admin-matching-rerun.spec.ts
```

Expected: FAIL until UI controls exist and admin auth fixture is aligned.

- [ ] **Step 3: Implement UI controls**

Update admin matching pages:

- Show current published version id and published date.
- Render weight inputs for `emotional_profile`, `communication_style`, `commitment_readiness`, `relationship_vision`.
- Render hard-filter checkboxes for gender, age range, distance, relationship intention, and deal breakers.
- Render deal-breaker participation checkboxes.
- Add `חישוב מחדש למשתמש` with a user id input.
- Add `חישוב מחדש לכל המשתמשים`.
- Use REST routes for save/publish/archive/rerun.
- Show Hebrew success and failure banners from API `message`.

- [ ] **Step 4: Run E2E**

Run:

```bash
npm run e2e -- tests/e2e/admin-matching-rerun.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Browser QA**

Capture screenshots:

- `http://127.0.0.1:3100/admin/matching` desktop and mobile.
- `http://127.0.0.1:3100/admin/matching/<draft-version-id>` desktop and mobile.

Expected: Weight controls, hard-filter controls, and rerun buttons are visible, readable, and not overlapping.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/matching tests/e2e/admin-matching-rerun.spec.ts
git commit -m "feat: add admin matching rerun ui"
```

## Acceptance Gates

- [ ] `npm test -- tests/unit/matching-settings-published.test.ts tests/unit/admin-match-settings.test.ts tests/unit/matching.test.ts tests/unit/matching-rerun.test.ts tests/unit/admin-matching-rest.test.ts tests/unit/matching-complete-route.test.ts`
- [ ] `npm run e2e -- tests/e2e/admin-matching-rerun.spec.ts`
- [ ] `npm run build`
- [ ] A completed matching questionnaire recalculates matches for that user.
- [ ] Admin global rerun recalculates matches and writes the published settings version id.
- [ ] Every admin mutation and rerun writes `admin_audit_logs`.
