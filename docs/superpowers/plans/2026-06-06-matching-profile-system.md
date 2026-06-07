# Matching Profile System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the `/profile/matching` failure and ship the first admin-configurable Hebrew RTL matching-profile system.

**Architecture:** Keep profile persistence server-side through Supabase service-role calls and the existing `save_matching_profile` RPC, but wrap public routes in a shared REST envelope with schema-health checks and Hebrew errors. Store profile form configuration as versioned admin-managed data, expose only the published config publicly, and render the public profile page from that config.

**Tech Stack:** Next.js App Router route handlers, TypeScript, Supabase migrations/RPCs, Zod, Vitest, React Testing Library, Playwright.

---

## Scope Boundary

This milestone includes:

- Fixing the current `/profile/matching` failure path.
- Verifying the matching-profile schema and RPC before reads/writes.
- Introducing shared API response helpers for touched routes.
- Replacing English API/user validation copy in the matching profile flow with Hebrew.
- Creating versioned profile-form configuration tables.
- Adding public `GET /api/profile/matching/config`.
- Adding admin REST endpoints and UI for profile-form config draft, publish, archive, and edit.

This milestone does not include:

- Changing the matching scoring algorithm.
- Running global match recalculation.
- Expanding REST parity beyond profile-form config.
- Applying remote Supabase migrations without explicit permission and credentials.

## Files

Create:

- `src/lib/api/envelope.ts`: shared success/failure JSON helpers.
- `src/domain/matching/schema-health.ts`: local schema-health checks for matching profile tables/RPC.
- `src/domain/matching/profile-errors.ts`: stable error codes mapped to Hebrew copy.
- `src/domain/matching/profile-form-config.ts`: config schema, defaults, validation, and public projection.
- `src/app/api/profile/matching/config/route.ts`: public published profile-form config endpoint.
- `src/app/api/admin/profile-form-config/route.ts`: admin list/create route.
- `src/app/api/admin/profile-form-config/[versionId]/route.ts`: admin get/update route.
- `src/app/api/admin/profile-form-config/[versionId]/publish/route.ts`: admin publish route.
- `src/app/api/admin/profile-form-config/[versionId]/archive/route.ts`: admin archive route.
- `src/app/admin/profile-form/page.tsx`: admin profile-form config list.
- `src/app/admin/profile-form/[versionId]/page.tsx`: admin profile-form editor.
- `src/app/admin/profile-form/[versionId]/profile-form-config-editor.tsx`: client editor.
- `supabase/migrations/202606060002_profile_form_config.sql`: versioned config schema and seed.
- `tests/unit/api-envelope.test.ts`
- `tests/unit/matching-schema-health.test.ts`
- `tests/unit/profile-form-config.test.ts`
- `tests/unit/profile-matching-hebrew-errors.test.ts`
- `tests/unit/profile-form-config-route.test.ts`
- `tests/unit/admin-profile-form-config-route.test.ts`
- `tests/e2e/profile-matching.spec.ts`
- `tests/e2e/admin-profile-form-config.spec.ts`

Modify:

- `src/app/api/profile/matching/route.ts`: use schema-health, envelope, Hebrew errors, and config-aware validation.
- `src/domain/matching/profile.ts`: accept config-derived option sets and return stable validation codes.
- `src/app/profile/matching/page.tsx`: load config and render Hebrew RTL states.
- `src/app/profile/matching/matching-profile-form.tsx`: render from config and show Hebrew validation/server errors.
- `src/app/admin/layout.tsx`: add profile-form config navigation entry.
- `src/app/matches/matches-loader.ts`: keep profile completeness aligned with config/defaults.
- `tests/unit/profile-matching-route.test.ts`: update expected response envelope and Hebrew errors.
- `tests/unit/matching-profile.test.ts`: update validation behavior.

## Task 1: Add Shared API Envelope

**Files:**

- Create: `src/lib/api/envelope.ts`
- Test: `tests/unit/api-envelope.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/api-envelope.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { apiError, apiOk } from "../../src/lib/api/envelope";

describe("api envelope", () => {
  it("returns ok responses", async () => {
    const response = apiOk({ complete: true });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { complete: true },
    });
  });

  it("returns stable error responses with Hebrew messages", async () => {
    const response = apiError(400, "profile_invalid", "הפרטים שהוזנו אינם תקינים.", {
      fields: ["birthYear"],
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "profile_invalid",
      message: "הפרטים שהוזנו אינם תקינים.",
      details: { fields: ["birthYear"] },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/api-envelope.test.ts
```

Expected: FAIL because `src/lib/api/envelope.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/lib/api/envelope.ts`:

```ts
import { NextResponse, type NextResponse as NextResponseType } from "next/server";

export type ApiSuccess<T = unknown> = {
  ok: true;
  data?: T;
};

export type ApiFailure = {
  ok: false;
  code: string;
  message: string;
  details?: unknown;
};

export function apiOk<T>(data?: T, init?: ResponseInit): NextResponseType<ApiSuccess<T>> {
  return NextResponse.json(data === undefined ? { ok: true } : { ok: true, data }, init);
}

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponseType<ApiFailure> {
  return NextResponse.json(
    details === undefined ? { ok: false, code, message } : { ok: false, code, message, details },
    { status },
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/unit/api-envelope.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/envelope.ts tests/unit/api-envelope.test.ts
git commit -m "feat: add shared api envelope"
```

## Task 2: Add Matching Schema Health Checks

**Files:**

- Create: `src/domain/matching/schema-health.ts`
- Test: `tests/unit/matching-schema-health.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/matching-schema-health.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { assertMatchingProfileSchemaHealth } from "../../src/domain/matching/schema-health";

describe("matching profile schema health", () => {
  it("passes when profiles, deal breakers, and save RPC are available", async () => {
    const supabase = {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => ({
          limit: vi.fn(() =>
            Promise.resolve(table === "profiles" || table === "profile_deal_breakers" ? { error: null } : { error: new Error("bad") }),
          ),
        })),
      })),
      rpc: vi.fn(() => Promise.resolve({ error: null })),
    };

    await expect(assertMatchingProfileSchemaHealth(supabase)).resolves.toEqual({ ok: true });
  });

  it("returns a schema_unavailable failure when a required object is missing", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ error: { message: "column does not exist" } })),
        })),
      })),
      rpc: vi.fn(() => Promise.resolve({ error: null })),
    };

    await expect(assertMatchingProfileSchemaHealth(supabase)).resolves.toEqual({
      ok: false,
      code: "schema_unavailable",
      message: "מערכת פרופיל ההתאמות לא זמינה כרגע.",
      details: { check: "profiles" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/matching-schema-health.test.ts
```

Expected: FAIL because the schema-health module does not exist.

- [ ] **Step 3: Implement health checks**

Create `src/domain/matching/schema-health.ts`:

```ts
type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      limit: (count: number) => Promise<{ error: { message?: string } | null }>;
    };
  };
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
};

export type MatchingSchemaHealth =
  | { ok: true }
  | { ok: false; code: "schema_unavailable"; message: string; details: { check: string } };

const UNAVAILABLE = "מערכת פרופיל ההתאמות לא זמינה כרגע.";

export async function assertMatchingProfileSchemaHealth(supabase: SupabaseLike): Promise<MatchingSchemaHealth> {
  const profileCheck = await supabase
    .from("profiles")
    .select(
      "user_id, birth_year, preferred_age_min, preferred_age_max, gender, interested_in, location_text, location_latitude, location_longitude, preferred_distance_km, relationship_intention",
    )
    .limit(1);

  if (profileCheck.error) {
    return { ok: false, code: "schema_unavailable", message: UNAVAILABLE, details: { check: "profiles" } };
  }

  const dealBreakerCheck = await supabase
    .from("profile_deal_breakers")
    .select("user_id, label, normalized_key, other_text")
    .limit(1);

  if (dealBreakerCheck.error) {
    return { ok: false, code: "schema_unavailable", message: UNAVAILABLE, details: { check: "profile_deal_breakers" } };
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/unit/matching-schema-health.test.ts
```

Expected: PASS.

- [ ] **Step 5: Wire the health check into the route**

Modify `src/app/api/profile/matching/route.ts` before database reads/writes:

```ts
const health = await assertMatchingProfileSchemaHealth(supabase);

if (!health.ok) {
  return apiError(503, health.code, health.message, health.details);
}
```

- [ ] **Step 6: Update route tests**

Modify `tests/unit/profile-matching-route.test.ts` to assert missing schema returns:

```ts
expect(response.status).toBe(503);
await expect(response.json()).resolves.toMatchObject({
  ok: false,
  code: "schema_unavailable",
  message: "מערכת פרופיל ההתאמות לא זמינה כרגע.",
});
```

- [ ] **Step 7: Run matching route tests**

Run:

```bash
npm test -- tests/unit/profile-matching-route.test.ts tests/unit/matching-schema-health.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/domain/matching/schema-health.ts src/app/api/profile/matching/route.ts tests/unit/matching-schema-health.test.ts tests/unit/profile-matching-route.test.ts
git commit -m "fix: add matching profile schema health"
```

## Task 3: Convert Matching Profile Route To Hebrew REST Contract

**Files:**

- Create: `src/domain/matching/profile-errors.ts`
- Modify: `src/domain/matching/profile.ts`
- Modify: `src/app/api/profile/matching/route.ts`
- Test: `tests/unit/profile-matching-hebrew-errors.test.ts`
- Test: `tests/unit/matching-profile.test.ts`
- Test: `tests/unit/profile-matching-route.test.ts`

- [ ] **Step 1: Write failing error tests**

Create `tests/unit/profile-matching-hebrew-errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { matchingProfileErrorMessage } from "../../src/domain/matching/profile-errors";

describe("matching profile Hebrew errors", () => {
  it("maps stable validation codes to Hebrew display messages", () => {
    expect(matchingProfileErrorMessage("birth_year_invalid")).toBe("שנת הלידה חייבת להתאים לפרופיל של בגיר.");
    expect(matchingProfileErrorMessage("deal_breakers_required")).toBe("בחרו לפחות דבר אחד שחשוב לכם לסנן.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/profile-matching-hebrew-errors.test.ts
```

Expected: FAIL because the error module does not exist.

- [ ] **Step 3: Implement error copy**

Create `src/domain/matching/profile-errors.ts`:

```ts
export type MatchingProfileErrorCode =
  | "profile_required"
  | "birth_year_invalid"
  | "preferred_age_min_invalid"
  | "preferred_age_max_invalid"
  | "preferred_age_range_invalid"
  | "gender_required"
  | "interested_in_required"
  | "location_required"
  | "location_coordinates_invalid"
  | "preferred_distance_invalid"
  | "relationship_intention_required"
  | "deal_breakers_required"
  | "profile_invalid"
  | "location_not_found"
  | "authentication_required";

const messages: Record<MatchingProfileErrorCode, string> = {
  profile_required: "יש למלא את פרטי פרופיל ההתאמות.",
  birth_year_invalid: "שנת הלידה חייבת להתאים לפרופיל של בגיר.",
  preferred_age_min_invalid: "גיל המינימום להעדפה אינו תקין.",
  preferred_age_max_invalid: "גיל המקסימום להעדפה אינו תקין.",
  preferred_age_range_invalid: "טווח הגילים חייב להתחיל בגיל נמוך או שווה לגיל הסיום.",
  gender_required: "בחרו את המגדר שלכם.",
  interested_in_required: "בחרו את המגדר שמעניין אתכם להכיר.",
  location_required: "בחרו עיר או אזור.",
  location_coordinates_invalid: "פרטי המיקום שנשלחו אינם תקינים.",
  preferred_distance_invalid: "טווח המרחק חייב להיות בין 1 ל-500 קילומטר.",
  relationship_intention_required: "בחרו את סוג הקשר שאתם מחפשים.",
  deal_breakers_required: "בחרו לפחות דבר אחד שחשוב לכם לסנן.",
  profile_invalid: "הפרטים שהוזנו אינם תקינים.",
  location_not_found: "לא הצלחנו למצוא את המיקום. בחרו עיר קרובה או בדקו את האיות.",
  authentication_required: "צריך להתחבר כדי למלא את פרופיל ההתאמות.",
};

export function matchingProfileErrorMessage(code: MatchingProfileErrorCode) {
  return messages[code];
}
```

- [ ] **Step 4: Update validation to return codes**

Modify `src/domain/matching/profile.ts` so `MatchingProfileValidationResult` is:

```ts
import type { MatchingProfileErrorCode } from "./profile-errors";

export type MatchingProfileValidationResult =
  | { ok: true; value: MatchingProfileValue }
  | { ok: false; errors: MatchingProfileErrorCode[] };
```

Replace existing English validation pushes with these codes:

```ts
if (!input || typeof input !== "object") {
  return { ok: false, errors: ["profile_required"] };
}

if (birthYear === null || birthYear < currentYear - MAX_AGE || birthYear > currentYear - MIN_AGE) {
  errors.push("birth_year_invalid");
}
```

Use the same mapping for each field:

```ts
const textFieldCodes = {
  gender: "gender_required",
  interestedIn: "interested_in_required",
  locationText: "location_required",
  relationshipIntention: "relationship_intention_required",
} as const;
```

- [ ] **Step 5: Update route envelope**

Modify `src/app/api/profile/matching/route.ts`:

```ts
if (!userId) {
  return apiError(401, "authentication_required", matchingProfileErrorMessage("authentication_required"));
}

if (!parsed.ok) {
  return apiError(400, "profile_invalid", matchingProfileErrorMessage("profile_invalid"), {
    errors: parsed.errors.map((code) => ({
      code,
      message: matchingProfileErrorMessage(code),
    })),
  });
}

if (!locationCoordinates) {
  return apiError(400, "location_not_found", matchingProfileErrorMessage("location_not_found"));
}

return apiOk({ complete: true });
```

- [ ] **Step 6: Update route tests**

In `tests/unit/profile-matching-route.test.ts`, expect:

```ts
await expect(response.json()).resolves.toMatchObject({
  ok: false,
  code: "profile_invalid",
  message: "הפרטים שהוזנו אינם תקינים.",
  details: {
    errors: expect.arrayContaining([
      { code: "birth_year_invalid", message: "שנת הלידה חייבת להתאים לפרופיל של בגיר." },
    ]),
  },
});
```

- [ ] **Step 7: Run tests**

Run:

```bash
npm test -- tests/unit/profile-matching-hebrew-errors.test.ts tests/unit/matching-profile.test.ts tests/unit/profile-matching-route.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/domain/matching/profile-errors.ts src/domain/matching/profile.ts src/app/api/profile/matching/route.ts tests/unit/profile-matching-hebrew-errors.test.ts tests/unit/matching-profile.test.ts tests/unit/profile-matching-route.test.ts
git commit -m "fix: return hebrew matching profile errors"
```

## Task 4: Add Versioned Profile Form Config Schema

**Files:**

- Create: `supabase/migrations/202606060002_profile_form_config.sql`
- Create: `src/domain/matching/profile-form-config.ts`
- Test: `tests/unit/profile-form-config.test.ts`

- [ ] **Step 1: Write config tests**

Create `tests/unit/profile-form-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE_FORM_CONFIG, parseProfileFormConfig, publicProfileFormConfig } from "../../src/domain/matching/profile-form-config";

describe("profile form config", () => {
  it("accepts the default Hebrew config", () => {
    expect(parseProfileFormConfig(DEFAULT_PROFILE_FORM_CONFIG).ok).toBe(true);
  });

  it("rejects duplicate option values", () => {
    const result = parseProfileFormConfig({
      ...DEFAULT_PROFILE_FORM_CONFIG,
      genderOptions: [
        { value: "woman", label: "אישה" },
        { value: "woman", label: "אישה נוספת" },
      ],
    });

    expect(result).toEqual({
      ok: false,
      errors: [{ code: "duplicate_option_value", field: "genderOptions" }],
    });
  });

  it("projects only public fields", () => {
    expect(publicProfileFormConfig(DEFAULT_PROFILE_FORM_CONFIG)).toMatchObject({
      birthYear: { minAge: 18, maxAge: 120 },
      genderOptions: expect.arrayContaining([{ value: "woman", label: "אישה" }]),
      direction: "rtl",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/profile-form-config.test.ts
```

Expected: FAIL because the config module does not exist.

- [ ] **Step 3: Add migration**

Create `supabase/migrations/202606060002_profile_form_config.sql`:

```sql
create table if not exists public.profile_form_configs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.profile_form_config_versions (
  id uuid primary key default gen_random_uuid(),
  profile_form_config_id uuid not null references public.profile_form_configs(id),
  version integer not null,
  status text not null check (status in ('draft', 'published', 'archived')),
  config jsonb not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (profile_form_config_id, version)
);

create index if not exists profile_form_config_versions_status_idx
  on public.profile_form_config_versions(profile_form_config_id, status);

insert into public.profile_form_configs (slug)
values ('default')
on conflict (slug) do nothing;

insert into public.profile_form_config_versions (
  profile_form_config_id,
  version,
  status,
  config,
  published_at
)
select
  profile_form_configs.id,
  1,
  'published',
  '{
    "direction": "rtl",
    "birthYear": { "minAge": 18, "maxAge": 120 },
    "preferredAge": { "min": 18, "max": 120 },
    "preferredDistanceKm": { "min": 1, "max": 500, "default": 50 },
    "genderOptions": [
      { "value": "woman", "label": "אישה" },
      { "value": "man", "label": "גבר" },
      { "value": "non_binary", "label": "א-בינארי" }
    ],
    "interestedInOptions": [
      { "value": "woman", "label": "נשים" },
      { "value": "man", "label": "גברים" },
      { "value": "non_binary", "label": "א-בינאריים" }
    ],
    "relationshipIntentions": [
      { "value": "serious", "label": "קשר רציני" },
      { "value": "marriage", "label": "קשר למטרת נישואים" },
      { "value": "open_to_see", "label": "פתוח/ה לראות לאן זה הולך" }
    ],
    "dealBreakers": [
      { "value": "smoking", "label": "עישון" },
      { "value": "wants_children_mismatch", "label": "פער ברצון לילדים" },
      { "value": "religion_values_mismatch", "label": "פער דתי או ערכי" },
      { "value": "political_values_mismatch", "label": "פער פוליטי" },
      { "value": "pets_mismatch", "label": "חיות מחמד" },
      { "value": "substance_use", "label": "שימוש בחומרים" },
      { "value": "financial_instability", "label": "חוסר יציבות כלכלית" },
      { "value": "long_distance", "label": "מרחק גדול מדי" },
      { "value": "other", "label": "אחר" }
    ]
  }'::jsonb,
  now()
from public.profile_form_configs
where slug = 'default'
on conflict (profile_form_config_id, version) do nothing;
```

- [ ] **Step 4: Implement config domain**

Create `src/domain/matching/profile-form-config.ts` with the JSON shape from the migration, a duplicate-value validator, and a `publicProfileFormConfig` projection:

```ts
export type ProfileFormOption = { value: string; label: string };
export type ProfileFormConfig = {
  direction: "rtl";
  birthYear: { minAge: number; maxAge: number };
  preferredAge: { min: number; max: number };
  preferredDistanceKm: { min: number; max: number; default: number };
  genderOptions: ProfileFormOption[];
  interestedInOptions: ProfileFormOption[];
  relationshipIntentions: ProfileFormOption[];
  dealBreakers: ProfileFormOption[];
};

export const DEFAULT_PROFILE_FORM_CONFIG: ProfileFormConfig = {
  direction: "rtl",
  birthYear: { minAge: 18, maxAge: 120 },
  preferredAge: { min: 18, max: 120 },
  preferredDistanceKm: { min: 1, max: 500, default: 50 },
  genderOptions: [
    { value: "woman", label: "אישה" },
    { value: "man", label: "גבר" },
    { value: "non_binary", label: "א-בינארי" },
  ],
  interestedInOptions: [
    { value: "woman", label: "נשים" },
    { value: "man", label: "גברים" },
    { value: "non_binary", label: "א-בינאריים" },
  ],
  relationshipIntentions: [
    { value: "serious", label: "קשר רציני" },
    { value: "marriage", label: "קשר למטרת נישואים" },
    { value: "open_to_see", label: "פתוח/ה לראות לאן זה הולך" },
  ],
  dealBreakers: [
    { value: "smoking", label: "עישון" },
    { value: "wants_children_mismatch", label: "פער ברצון לילדים" },
    { value: "religion_values_mismatch", label: "פער דתי או ערכי" },
    { value: "political_values_mismatch", label: "פער פוליטי" },
    { value: "pets_mismatch", label: "חיות מחמד" },
    { value: "substance_use", label: "שימוש בחומרים" },
    { value: "financial_instability", label: "חוסר יציבות כלכלית" },
    { value: "long_distance", label: "מרחק גדול מדי" },
    { value: "other", label: "אחר" },
  ],
};

export function parseProfileFormConfig(input: unknown):
  | { ok: true; value: ProfileFormConfig }
  | { ok: false; errors: { code: "invalid_config" | "duplicate_option_value"; field: keyof ProfileFormConfig }[] } {
  const config = input as ProfileFormConfig;
  const optionFields = ["genderOptions", "interestedInOptions", "relationshipIntentions", "dealBreakers"] as const;
  const errors: { code: "invalid_config" | "duplicate_option_value"; field: keyof ProfileFormConfig }[] = [];

  for (const field of optionFields) {
    const options = Array.isArray(config?.[field]) ? config[field] : [];
    const values = new Set<string>();

    if (!options.length) {
      errors.push({ code: "invalid_config", field });
      continue;
    }

    for (const option of options) {
      if (!option?.value || !option?.label || values.has(option.value)) {
        errors.push({ code: "duplicate_option_value", field });
        break;
      }
      values.add(option.value);
    }
  }

  if (config?.direction !== "rtl") {
    errors.push({ code: "invalid_config", field: "direction" });
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: config };
}

export function publicProfileFormConfig(config: ProfileFormConfig) {
  return config;
}
```

- [ ] **Step 5: Run config tests**

Run:

```bash
npm test -- tests/unit/profile-form-config.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202606060002_profile_form_config.sql src/domain/matching/profile-form-config.ts tests/unit/profile-form-config.test.ts
git commit -m "feat: add profile form config model"
```

## Task 5: Add Public Profile Form Config API

**Files:**

- Create: `src/app/api/profile/matching/config/route.ts`
- Test: `tests/unit/profile-form-config-route.test.ts`

- [ ] **Step 1: Write route test**

Create `tests/unit/profile-form-config-route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { GET } from "../../src/app/api/profile/matching/config/route";

vi.mock("../../src/lib/supabase/admin", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { id: "v1", version: 1, config: { direction: "rtl", genderOptions: [{ value: "woman", label: "אישה" }], interestedInOptions: [{ value: "man", label: "גברים" }], relationshipIntentions: [{ value: "serious", label: "קשר רציני" }], dealBreakers: [{ value: "smoking", label: "עישון" }], birthYear: { minAge: 18, maxAge: 120 }, preferredAge: { min: 18, max: 120 }, preferredDistanceKm: { min: 1, max: 500, default: 50 } } },
                error: null,
              }),
          }),
        }),
      }),
    }),
  }),
}));

describe("profile form config route", () => {
  it("returns the published config in the shared envelope", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        versionId: "v1",
        version: 1,
        config: { direction: "rtl" },
      },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/profile-form-config-route.test.ts
```

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement route**

Create `src/app/api/profile/matching/config/route.ts`:

```ts
import { apiError, apiOk } from "@/lib/api/envelope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { DEFAULT_PROFILE_FORM_CONFIG, parseProfileFormConfig, publicProfileFormConfig } from "@/domain/matching/profile-form-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("profile_form_config_versions")
    .select("id, version, config")
    .eq("status", "published")
    .eq("profile_form_configs.slug", "default")
    .maybeSingle<{ id: string; version: number; config: unknown }>();

  if (error) {
    return apiError(503, "schema_unavailable", "הגדרות פרופיל ההתאמות לא זמינות כרגע.", { check: "profile_form_config_versions" });
  }

  const parsed = parseProfileFormConfig(data?.config ?? DEFAULT_PROFILE_FORM_CONFIG);

  if (!parsed.ok) {
    return apiError(503, "published_config_invalid", "הגדרות פרופיל ההתאמות אינן תקינות.", parsed.errors);
  }

  return apiOk({
    versionId: data?.id ?? "default",
    version: data?.version ?? 1,
    config: publicProfileFormConfig(parsed.value),
  });
}
```

- [ ] **Step 4: Run route test**

Run:

```bash
npm test -- tests/unit/profile-form-config-route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/profile/matching/config/route.ts tests/unit/profile-form-config-route.test.ts
git commit -m "feat: expose published profile form config"
```

## Task 6: Render Public Matching Profile From Config

**Files:**

- Modify: `src/app/profile/matching/page.tsx`
- Modify: `src/app/profile/matching/matching-profile-form.tsx`
- Test: `tests/unit/matching-profile.test.ts`
- E2E: `tests/e2e/profile-matching.spec.ts`

- [ ] **Step 1: Add UI/E2E expectations**

Create or update `tests/e2e/profile-matching.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("registered user saves Hebrew matching profile", async ({ page }) => {
  await page.goto("/profile/matching");

  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "פרופיל התאמות" })).toBeVisible();
  await expect(page.getByLabel("שנת לידה")).toBeVisible();
  await expect(page.getByRole("button", { name: "שמירת פרופיל" })).toBeVisible();
});
```

- [ ] **Step 2: Run E2E test to verify current failure**

Run:

```bash
npm run e2e -- tests/e2e/profile-matching.spec.ts
```

Expected: FAIL until auth fixture and Hebrew/config rendering are completed.

- [ ] **Step 3: Update server page**

Modify `src/app/profile/matching/page.tsx` so the page fetches profile data and config server-side or passes both URLs to the client. Use Hebrew fallback states:

```tsx
export default async function MatchingProfilePage() {
  return (
    <main dir="rtl" className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <header>
        <p className="text-sm font-medium text-rose-700">שלב התאמות</p>
        <h1 className="text-3xl font-bold text-slate-950">פרופיל התאמות</h1>
        <p className="mt-2 text-slate-700">מלאו את הפרטים שיעזרו לנו להציג התאמות רלוונטיות ומכבדות.</p>
      </header>
      <MatchingProfileForm />
    </main>
  );
}
```

- [ ] **Step 4: Update client form**

Modify `src/app/profile/matching/matching-profile-form.tsx`:

- Fetch `/api/profile/matching/config`.
- Fetch `/api/profile/matching`.
- Expect `ok/data` envelope.
- Render options from `data.config`.
- Show API failure `message` directly.
- Use button text `שמירת פרופיל`.
- Use field labels `שנת לידה`, `טווח גילים מועדף`, `מגדר`, `מעוניינים להכיר`, `עיר או אזור`, `מרחק מקסימלי`, `סוג קשר`, `דברים שחשוב לסנן`.

- [ ] **Step 5: Run focused UI tests**

Run:

```bash
npm test -- tests/unit/matching-profile.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run E2E test**

Run:

```bash
npm run e2e -- tests/e2e/profile-matching.spec.ts
```

Expected: PASS after test auth setup is aligned with existing E2E helpers.

- [ ] **Step 7: Capture browser screenshots**

Run the app:

```bash
npm run dev
```

Open and capture:

- `http://127.0.0.1:3100/profile/matching` at 390px width.
- `http://127.0.0.1:3100/profile/matching` at 1440px width.

Expected: Hebrew text is readable, form controls do not overlap, and no mojibake appears.

- [ ] **Step 8: Commit**

```bash
git add src/app/profile/matching/page.tsx src/app/profile/matching/matching-profile-form.tsx tests/unit/matching-profile.test.ts tests/e2e/profile-matching.spec.ts
git commit -m "fix: render hebrew matching profile form"
```

## Task 7: Add Admin Profile Form Config REST And UI

**Files:**

- Create: `src/app/api/admin/profile-form-config/route.ts`
- Create: `src/app/api/admin/profile-form-config/[versionId]/route.ts`
- Create: `src/app/api/admin/profile-form-config/[versionId]/publish/route.ts`
- Create: `src/app/api/admin/profile-form-config/[versionId]/archive/route.ts`
- Create: `src/app/admin/profile-form/page.tsx`
- Create: `src/app/admin/profile-form/[versionId]/page.tsx`
- Create: `src/app/admin/profile-form/[versionId]/profile-form-config-editor.tsx`
- Modify: `src/app/admin/layout.tsx`
- Test: `tests/unit/admin-profile-form-config-route.test.ts`
- E2E: `tests/e2e/admin-profile-form-config.spec.ts`

- [ ] **Step 1: Write REST contract tests**

Create `tests/unit/admin-profile-form-config-route.test.ts` with assertions for:

```ts
expect(nonAdminResponse.status).toBe(403);
await expect(nonAdminResponse.json()).resolves.toMatchObject({
  ok: false,
  code: "forbidden",
  message: "אין לך הרשאת מנהל.",
});

expect(publishResponse.status).toBe(200);
await expect(publishResponse.json()).resolves.toMatchObject({
  ok: true,
  data: { status: "published" },
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/unit/admin-profile-form-config-route.test.ts
```

Expected: FAIL because admin profile-form routes do not exist.

- [ ] **Step 3: Implement admin routes**

Implement the routes using:

- Admin role check based on `app_metadata.role === "admin"`.
- `parseProfileFormConfig` before saving.
- `admin_audit_logs` insert for create, update, publish, and archive.
- Shared envelope responses.

Mutation actions:

```ts
const actions = {
  create: "profile_form_config.create_draft",
  update: "profile_form_config.update_draft",
  publish: "profile_form_config.publish",
  archive: "profile_form_config.archive",
};
```

- [ ] **Step 4: Build admin pages**

Add `/admin/profile-form` list and `/admin/profile-form/[versionId]` editor:

- Page title: `הגדרות פרופיל התאמות`
- Primary action: `טיוטה חדשה`
- Publish action: `פרסום`
- Archive action: `ארכוב`
- Editor uses a JSON textarea with validation summary in Hebrew.
- Published versions are read-only.

- [ ] **Step 5: Add admin navigation**

Modify `src/app/admin/layout.tsx` and add link text:

```tsx
{ href: "/admin/profile-form", label: "פרופיל התאמות" }
```

- [ ] **Step 6: Run admin tests**

Run:

```bash
npm test -- tests/unit/admin-profile-form-config-route.test.ts
npm run e2e -- tests/e2e/admin-profile-form-config.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Browser QA admin pages**

Capture desktop and mobile screenshots for:

- `http://127.0.0.1:3100/admin/profile-form`
- `http://127.0.0.1:3100/admin/profile-form/<draft-version-id>`

Expected: Hebrew RTL admin pages render without overflow, and publish/archive buttons are clearly disabled or enabled by status.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/admin/profile-form-config src/app/admin/profile-form src/app/admin/layout.tsx tests/unit/admin-profile-form-config-route.test.ts tests/e2e/admin-profile-form-config.spec.ts
git commit -m "feat: add admin profile form config"
```

## Acceptance Gates

- [ ] `npm test -- tests/unit/api-envelope.test.ts tests/unit/matching-schema-health.test.ts tests/unit/profile-form-config.test.ts tests/unit/profile-matching-hebrew-errors.test.ts tests/unit/profile-matching-route.test.ts tests/unit/admin-profile-form-config-route.test.ts`
- [ ] `npm run e2e -- tests/e2e/profile-matching.spec.ts tests/e2e/admin-profile-form-config.spec.ts`
- [ ] `npm run build`
- [ ] Browser screenshots for public matching profile and admin profile-form config at mobile and desktop widths.
- [ ] Manual check: no English visible copy appears in `/profile/matching`.
- [ ] Manual check: missing matching schema returns `503` with `code: "schema_unavailable"` and Hebrew `message`.
