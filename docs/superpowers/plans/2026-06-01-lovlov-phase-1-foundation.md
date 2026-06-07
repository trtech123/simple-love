# lovlov.me Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production-ready vertical slice for `lovlov.me`: app scaffold, Supabase schema, seeded configurable quiz/report content, tested domain services, mocked UPay/OpenAI flows, registration claim tokens, initial matching logic, and chat persistence foundations.

**Architecture:** Use Next.js App Router with server-side route handlers/actions for privileged operations, Supabase for auth/data/realtime/storage, and focused TypeScript domain modules for quiz sessions, payments, AI reports, matching, and chat authorization. External providers start behind adapters so tests use local mocks while production code calls UPay and OpenAI through the same interfaces.

**Tech Stack:** Next.js, TypeScript, Supabase, SQL migrations, Vitest, React Testing Library, Playwright, Tailwind CSS, OpenAI SDK, provider adapter interfaces.

---

## Scope Boundary

This plan covers Phase 1 foundation. It intentionally creates a working, testable path with mocked external provider behavior and database-ready contracts.

Phase 1 includes:

- New Next.js app scaffold.
- Supabase schema migrations and seed data.
- Questionnaire/version model.
- Guest quiz session flow.
- Payment state machine with UPay adapter interface and mock implementation.
- AI report generation service with prompt versioning and mock implementation.
- Registration claim token service.
- Initial profile trait and matching engine.
- Chat persistence and permission model.
- Minimal admin screens for content visibility and settings edits.

Phase 1 does not include:

- Live UPay sandbox credential wiring.
- Final OpenAI prompt from product owner.
- Production PDF rendering.
- Full visual polish of every screen.
- Full abuse operations dashboard.

Those are separate follow-up plans after this foundation is green.

## File Structure

Create the app from an empty folder with the following major files:

- `package.json`: scripts and dependencies.
- `next.config.ts`: Next.js config.
- `tsconfig.json`: TypeScript config.
- `vitest.config.ts`: unit/integration test config.
- `playwright.config.ts`: e2e config.
- `src/app/layout.tsx`: Hebrew RTL app shell.
- `src/app/page.tsx`: landing/quiz entry.
- `src/app/quiz/page.tsx`: guest questionnaire UI.
- `src/app/report/[token]/page.tsx`: paid report page and registration CTA.
- `src/app/register/page.tsx`: registration handoff entry.
- `src/app/matching/questionnaire/page.tsx`: registered depth questionnaire.
- `src/app/matches/page.tsx`: match list.
- `src/app/chat/[conversationId]/page.tsx`: chat page.
- `src/app/admin/page.tsx`: admin dashboard.
- `src/app/api/payments/upay/webhook/route.ts`: UPay webhook route.
- `src/app/api/reports/generate/route.ts`: report generation route.
- `src/lib/supabase/client.ts`: browser Supabase client.
- `src/lib/supabase/server.ts`: server Supabase client.
- `src/lib/env.ts`: environment parsing.
- `src/domain/questionnaires/*`: questionnaire/version logic.
- `src/domain/payments/*`: payment state machine and provider adapter.
- `src/domain/reports/*`: prompt assembly and report generation.
- `src/domain/claims/*`: registration claim token logic.
- `src/domain/matching/*`: trait derivation and scoring.
- `src/domain/chat/*`: chat permission rules.
- `src/data/seeds/*`: seed definitions extracted from the source doc.
- `supabase/migrations/*.sql`: schema, RLS, indexes, seedable foundations.
- `tests/unit/**/*.test.ts`: domain tests.
- `tests/integration/**/*.test.ts`: route/service integration tests.
- `tests/e2e/**/*.spec.ts`: Playwright smoke tests.

## Task 1: Scaffold Next.js App And Test Harness

**Files:**

- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/lib/env.ts`
- Test: `tests/unit/env.test.ts`

- [ ] **Step 1: Write failing env test**

Create `tests/unit/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readEnv } from "../../src/lib/env";

describe("readEnv", () => {
  it("returns typed environment settings from a provided source", () => {
    const env = readEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      OPENAI_API_KEY: "openai",
      UPAY_TERMINAL_ID: "terminal",
      UPAY_API_KEY: "upay",
      APP_BASE_URL: "http://localhost:3000",
    });

    expect(env.appBaseUrl).toBe("http://localhost:3000");
    expect(env.supabase.url).toBe("https://example.supabase.co");
    expect(env.upay.terminalId).toBe("terminal");
  });

  it("throws a useful error when a required variable is missing", () => {
    expect(() => readEnv({})).toThrow("Missing environment variable: APP_BASE_URL");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/env.test.ts
```

Expected: FAIL because `package.json`, Vitest, and `src/lib/env.ts` do not exist yet.

- [ ] **Step 3: Create app/test configuration**

Create `package.json`:

```json
{
  "name": "simple-love",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@supabase/ssr": "^0.6.1",
    "@supabase/supabase-js": "^2.45.0",
    "next": "^15.0.0",
    "openai": "^4.70.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "@testing-library/react": "^16.0.1",
    "@types/node": "^22.7.5",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3",
    "vitest": "^2.1.2"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
  },
});
```

Create `src/lib/env.ts`:

```ts
import { z } from "zod";

const envSchema = z.object({
  APP_BASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  UPAY_TERMINAL_ID: z.string().min(1),
  UPAY_API_KEY: z.string().min(1),
});

export type AppEnv = ReturnType<typeof readEnv>;

export function readEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const key = first.path.join(".");
    throw new Error(`Missing environment variable: ${key}`);
  }

  return {
    appBaseUrl: parsed.data.APP_BASE_URL,
    supabase: {
      url: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      serviceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
    },
    openai: {
      apiKey: parsed.data.OPENAI_API_KEY,
    },
    upay: {
      terminalId: parsed.data.UPAY_TERMINAL_ID,
      apiKey: parsed.data.UPAY_API_KEY,
    },
  };
}
```

Create `src/app/layout.tsx`:

```tsx
import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "lovlov.me",
  description: "אבחון זוגי חכם והתאמות מדויקות",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
```

Create `src/app/page.tsx`:

```tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">lovlov.me</p>
        <h1>הזהות הזוגית שלך מתחילה באבחון קצר</h1>
        <p>ענו על שאלון קצר, קבלו דוח אישי, ואז המשיכו למנוע התאמות חכם.</p>
        <Link className="primary-link" href="/quiz">
          להתחלת השאלון
        </Link>
      </section>
    </main>
  );
}
```

Create `src/app/globals.css`:

```css
:root {
  color-scheme: light;
  font-family: Arial, sans-serif;
  background: #fbfaf8;
  color: #211f1d;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

.page-shell {
  min-height: 100vh;
  padding: 48px 24px;
}

.hero {
  max-width: 760px;
  margin: 0 auto;
}

.eyebrow {
  font-size: 14px;
  font-weight: 700;
}

h1 {
  font-size: 44px;
  line-height: 1.15;
  margin: 12px 0;
}

.primary-link {
  display: inline-flex;
  margin-top: 24px;
  padding: 12px 18px;
  border-radius: 8px;
  background: #1f2937;
  color: white;
  text-decoration: none;
}
```

- [ ] **Step 4: Install dependencies**

Run:

```bash
npm install
```

Expected: dependencies install and `package-lock.json` is created.

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm test -- tests/unit/env.test.ts
```

Expected: PASS.

- [ ] **Step 6: Build app**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

If this folder has been initialized as a git repository, run:

```bash
git add package.json package-lock.json next.config.ts tsconfig.json vitest.config.ts playwright.config.ts src tests
git commit -m "chore: scaffold lovlov app"
```

If not using git yet, record this checkpoint in the implementation notes.

## Task 2: Supabase Schema And RLS Foundations

**Files:**

- Create: `supabase/migrations/202606010001_foundation.sql`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Test: `tests/unit/schema-contract.test.ts`

- [ ] **Step 1: Write failing schema contract test**

Create `tests/unit/schema-contract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("foundation migration", () => {
  const sql = readFileSync("supabase/migrations/202606010001_foundation.sql", "utf8");

  it("creates the core tables required by the design", () => {
    for (const table of [
      "questionnaires",
      "questionnaire_versions",
      "quiz_sessions",
      "payments",
      "reports",
      "registration_claim_tokens",
      "profiles",
      "profile_traits",
      "matches",
      "conversations",
      "messages",
      "user_reports",
      "user_blocks",
      "admin_audit_logs",
    ]) {
      expect(sql).toContain(`create table public.${table}`);
    }
  });

  it("enables row level security on sensitive tables", () => {
    expect(sql).toContain("alter table public.profiles enable row level security");
    expect(sql).toContain("alter table public.messages enable row level security");
    expect(sql).toContain("alter table public.reports enable row level security");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/schema-contract.test.ts
```

Expected: FAIL because migration file does not exist.

- [ ] **Step 3: Create foundation migration**

Create `supabase/migrations/202606010001_foundation.sql`:

```sql
create extension if not exists "pgcrypto";

create type public.question_type as enum ('multiple_choice', 'scale', 'open_text');
create type public.quiz_session_status as enum ('started', 'completed', 'payment_pending', 'paid', 'report_generating', 'report_ready', 'report_failed');
create type public.payment_status as enum ('created', 'pending', 'paid', 'failed', 'cancelled');
create type public.report_status as enum ('pending', 'generating', 'completed', 'failed');
create type public.match_status as enum ('active', 'hidden', 'blocked');
create type public.conversation_status as enum ('active', 'blocked', 'disabled');

create table public.questionnaires (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  purpose text not null check (purpose in ('paid_report', 'matching')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.questionnaire_versions (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references public.questionnaires(id),
  version integer not null,
  status text not null check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (questionnaire_id, version)
);

create table public.questionnaire_blocks (
  id uuid primary key default gen_random_uuid(),
  questionnaire_version_id uuid not null references public.questionnaire_versions(id) on delete cascade,
  title text not null,
  position integer not null,
  unique (questionnaire_version_id, position)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  questionnaire_block_id uuid not null references public.questionnaire_blocks(id) on delete cascade,
  stable_key text not null,
  prompt text not null,
  question_type public.question_type not null,
  position integer not null,
  usage_flags jsonb not null default '{}'::jsonb,
  trait_mapping jsonb not null default '{}'::jsonb,
  unique (questionnaire_block_id, position)
);

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  label text not null,
  value text not null,
  position integer not null,
  score jsonb not null default '{}'::jsonb,
  unique (question_id, value)
);

create table public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  public_token text not null unique,
  user_id uuid references auth.users(id),
  questionnaire_version_id uuid not null references public.questionnaire_versions(id),
  status public.quiz_session_status not null default 'started',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  quiz_session_id uuid not null references public.quiz_sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  question_option_id uuid references public.question_options(id),
  text_answer text,
  created_at timestamptz not null default now(),
  unique (quiz_session_id, question_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  quiz_session_id uuid not null references public.quiz_sessions(id),
  provider text not null default 'upay',
  provider_reference text not null,
  status public.payment_status not null default 'created',
  amount_minor integer not null,
  currency text not null default 'ILS',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_reference)
);

create table public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  version integer not null,
  status text not null check (status in ('draft', 'published', 'archived')),
  template text not null,
  model text not null,
  model_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (slug, version)
);

create table public.archetypes (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique,
  created_at timestamptz not null default now()
);

create table public.archetype_versions (
  id uuid primary key default gen_random_uuid(),
  archetype_id uuid not null references public.archetypes(id),
  version integer not null,
  status text not null check (status in ('draft', 'published', 'archived')),
  name text not null,
  short_description text not null,
  full_description text not null,
  matching_meaning text not null,
  scoring_rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (archetype_id, version)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  quiz_session_id uuid not null references public.quiz_sessions(id),
  user_id uuid references auth.users(id),
  prompt_version_id uuid not null references public.prompt_versions(id),
  archetype_version_id uuid references public.archetype_versions(id),
  status public.report_status not null default 'pending',
  report_number text not null unique,
  input_snapshot jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quiz_session_id)
);

create table public.registration_claim_tokens (
  id uuid primary key default gen_random_uuid(),
  quiz_session_id uuid not null references public.quiz_sessions(id),
  report_id uuid not null references public.reports(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  claimed_by uuid references auth.users(id),
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  birth_year integer,
  gender text,
  interested_in text,
  location_text text,
  relationship_intention text,
  completed_depth_questionnaire_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_traits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  trait_key text not null,
  numeric_value numeric,
  text_value text,
  source_answer_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, trait_key)
);

create table public.match_settings (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.match_settings_versions (
  id uuid primary key default gen_random_uuid(),
  match_settings_id uuid not null references public.match_settings(id),
  version integer not null,
  status text not null check (status in ('draft', 'published', 'archived')),
  weights jsonb not null,
  hard_filters jsonb not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (match_settings_id, version)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(user_id),
  user_b uuid not null references public.profiles(user_id),
  match_settings_version_id uuid not null references public.match_settings_versions(id),
  score numeric not null check (score >= 0 and score <= 100),
  status public.match_status not null default 'active',
  calculated_at timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a < user_b)
);

create table public.match_explanations (
  match_id uuid primary key references public.matches(id) on delete cascade,
  explanation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.matches(id),
  status public.conversation_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(user_id),
  body text not null check (length(body) > 0 and length(body) <= 4000),
  created_at timestamptz not null default now()
);

create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(user_id),
  reported_user_id uuid not null references public.profiles(user_id),
  conversation_id uuid references public.conversations(id),
  message_ids uuid[] not null default '{}',
  reason text not null,
  created_at timestamptz not null default now()
);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(user_id),
  blocked_user_id uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_user_id)
);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  action text not null,
  target_table text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.quiz_sessions enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.payments enable row level security;
alter table public.reports enable row level security;
alter table public.registration_claim_tokens enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_traits enable row level security;
alter table public.matches enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.user_reports enable row level security;
alter table public.user_blocks enable row level security;

create index payments_quiz_session_id_idx on public.payments(quiz_session_id);
create index reports_user_id_idx on public.reports(user_id);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index matches_user_a_idx on public.matches(user_a);
create index matches_user_b_idx on public.matches(user_b);
```

- [ ] **Step 4: Create Supabase clients**

Create `src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

Create `src/lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    },
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm test -- tests/unit/schema-contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase src/lib/supabase tests/unit/schema-contract.test.ts
git commit -m "feat: add supabase foundation schema"
```

## Task 3: Seed Questionnaires And Archetypes

**Files:**

- Create: `src/data/seeds/archetypes.ts`
- Create: `src/data/seeds/report-questionnaire.ts`
- Create: `src/data/seeds/matching-questionnaire.ts`
- Test: `tests/unit/seed-data.test.ts`

- [ ] **Step 1: Write failing seed test**

Create `tests/unit/seed-data.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { archetypeSeeds } from "../../src/data/seeds/archetypes";
import { reportQuestionnaireSeed } from "../../src/data/seeds/report-questionnaire";
import { matchingQuestionnaireSeed } from "../../src/data/seeds/matching-questionnaire";

describe("seed data", () => {
  it("contains the 12 base archetypes", () => {
    expect(archetypeSeeds).toHaveLength(12);
    expect(archetypeSeeds[0]).toMatchObject({
      stableKey: "warm_closer",
      name: "החם הנסגר",
    });
  });

  it("contains a 22-question paid report questionnaire", () => {
    const questionCount = reportQuestionnaireSeed.blocks.flatMap((block) => block.questions).length;
    expect(reportQuestionnaireSeed.purpose).toBe("paid_report");
    expect(questionCount).toBe(22);
  });

  it("contains a 95-question matching questionnaire split into three blocks", () => {
    const questionCount = matchingQuestionnaireSeed.blocks.flatMap((block) => block.questions).length;
    expect(matchingQuestionnaireSeed.purpose).toBe("matching");
    expect(matchingQuestionnaireSeed.blocks).toHaveLength(3);
    expect(questionCount).toBe(95);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/seed-data.test.ts
```

Expected: FAIL because seed files do not exist.

- [ ] **Step 3: Create archetype seeds**

Create `src/data/seeds/archetypes.ts` with all 12 archetypes:

```ts
export type ArchetypeSeed = {
  stableKey: string;
  name: string;
  shortDescription: string;
  matchingMeaning: string;
};

export const archetypeSeeds: ArchetypeSeed[] = [
  {
    stableKey: "warm_closer",
    name: "החם הנסגר",
    shortDescription: "אוהב עמוק, אך בנה קיר. מחפש ביטחון, נמשך לאי-ודאות.",
    matchingMeaning: "מתאים במיוחד לפרטנר יציב, עקבי וחם שלא דוחף בכוח לפתיחות.",
  },
  {
    stableKey: "independent_giver",
    name: "הנותן העצמאי",
    shortDescription: "נותן הרבה אך קשה לו לבקש. צריך שיכבדו את גבולותיו.",
    matchingMeaning: "זקוק לפרטנר שמזהה נתינה בלי לנצל אותה ומכבד מרחב אישי.",
  },
  {
    stableKey: "careful_dreamer",
    name: "החולם הזהיר",
    shortDescription: "מדמיין הרבה, נכנס לאט. פגיעותו העמוקה היא אכזבה.",
    matchingMeaning: "מתאים למי שמוכן לבנות אמון בקצב הדרגתי וברור.",
  },
  {
    stableKey: "loyal_intense",
    name: "האינטנסיבי הנאמן",
    shortDescription: "כל-או-כלום. בגידה היא קו אדום מוחלט. מחפש עומק.",
    matchingMeaning: "צריך פרטנר שמסוגל לעומק רגשי בלי משחקים.",
  },
  {
    stableKey: "yearning_rational",
    name: "הרציונלי המשתוקק",
    shortDescription: "מנתח הכל שכלית, אך בפנים מחזיק כמיהה ענקית לחיבור.",
    matchingMeaning: "מתאים לפרטנר שמחבר בין עומק רגשי לתקשורת בהירה.",
  },
  {
    stableKey: "social_lonely",
    name: "החברותי הבודד",
    shortDescription: "נראה פתוח חברתית, אך ממעט להכניס אנשים לעומק ליבו.",
    matchingMeaning: "זקוק לפרטנר שמבחין בין חברותיות חיצונית לאינטימיות אמיתית.",
  },
  {
    stableKey: "stable_self_bored",
    name: "היציב המשעמם-את-עצמו",
    shortDescription: "מחפש ביטחון, אך מכבה את הניצוץ של עצמו. צריך ריענון.",
    matchingMeaning: "מתאים לפרטנר יציב שמכניס תנועה וחיות בלי דרמה.",
  },
  {
    stableKey: "pragmatic_romantic",
    name: "הרומנטי הפרגמטי",
    shortDescription: "רוצה אהבת כוכבים מהסרטים, אך חי על הקרקע בצורה נוקשה.",
    matchingMeaning: "צריך איזון בין רומנטיקה לבין בניית חיים מעשית.",
  },
  {
    stableKey: "commitment_fearful",
    name: "הפחדן-מחויבות",
    shortDescription: "אוהב ובורח ברגע שהקשר הופך לרציני ומחייב.",
    matchingMeaning: "מתאים לפרטנר שמייצר ביטחון ומחויבות הדרגתית.",
  },
  {
    stableKey: "drawn_to_disaster",
    name: "הנמשך לאסון",
    shortDescription: "מזהה דפוסים הרסניים ורעילים, אך לא מצליח לעצור את המשיכה אליהם.",
    matchingMeaning: "צריך התאמות שמפחיתות דרמה ומחזקות יציבות רגשית.",
  },
  {
    stableKey: "growth_after_break",
    name: "הצומח מהשבר",
    shortDescription: "עבר משברים זוגיים קשים, מגיע עם חוכמת חיים וזהירות בריאה.",
    matchingMeaning: "מתאים לפרטנר שמכבד עבר מורכב ובונה אמון לאט.",
  },
  {
    stableKey: "fresh_open",
    name: "הטרי",
    shortDescription: "חסר דפוסים מקובעים, מגיע עם פתיחות נקייה וניסיון מועט.",
    matchingMeaning: "זקוק לפרטנר סבלני שלא מנצל חוסר ניסיון.",
  },
];
```

- [ ] **Step 4: Create report questionnaire seed**

Create `src/data/seeds/report-questionnaire.ts` with 22 questions. Use stable keys `report_q01` through `report_q22`.

```ts
export type QuestionSeed = {
  stableKey: string;
  prompt: string;
  type: "multiple_choice" | "scale" | "open_text";
  options?: { label: string; value: string }[];
  usageFlags: {
    aiReportInput?: boolean;
    archetypeScoring?: boolean;
    matchingInput?: boolean;
    profileDealBreakerInput?: boolean;
  };
};

export type QuestionnaireSeed = {
  slug: string;
  title: string;
  purpose: "paid_report" | "matching";
  blocks: { title: string; questions: QuestionSeed[] }[];
};

const options = (...labels: string[]) =>
  labels.map((label, index) => ({ label, value: String.fromCharCode(97 + index) }));

export const reportQuestionnaireSeed: QuestionnaireSeed = {
  slug: "paid-report-v1",
  title: "שאלון ראשוני א",
  purpose: "paid_report",
  blocks: [
    {
      title: "שאלון אבחון אישי",
      questions: [
        { stableKey: "report_q01", prompt: "כשאתה/את נכנס/ת לקשר חדש, מה קורה אצלך ראשון?", type: "multiple_choice", options: options("נסגר/ת קצת", "נפתח/ת מיד", "מנתח/ת", "מתלהב/ת מהר ואז לפעמים מתחרט/ת"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q02", prompt: "מה יותר מפחיד אותך?", type: "multiple_choice", options: options("להידחות", "להתחייב", "להתאכזב שוב", "לפספס מישהו/י שבאמת מתאים/ה"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q03", prompt: "כשמישהו/י מביע/ה אהבה, מה הכי מרגש אותך?", type: "multiple_choice", options: options("מילים", "זמן", "מגע", "מעשים"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q04", prompt: "ריב עם בן/בת זוג, מה קורה אצלך בדרך כלל?", type: "multiple_choice", options: options("נסגר/ת ושותק/ת", "צריך/ה לפתור עכשיו", "מתרגז/ת ואחר כך מצטער/ת", "מנסה להבין לפני תגובה"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q05", prompt: "בחר/י את המשפט שהכי מדבר אליך", type: "multiple_choice", options: options("צריך/ה מרחב", "צריך/ה שיהיו שם תמיד", "צריך/ה שיצחיקו אותי", "צריך/ה שיאתגרו אותי"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q06", prompt: "מה מבטא אותך הכי טוב בתוך קשר?", type: "multiple_choice", options: options("הדואג/ת", "הנשען/ת", "השותף/ה", "העצמאי/ת"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q07", prompt: "מה הכי פעמים גרם לך לצאת מקשר?", type: "multiple_choice", options: options("חוסר תקשורת", "חוסר כימיה", "ערכים שונים", "תזמון לא נכון"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q08", prompt: "איזה משפט שמעת על עצמך יותר מפעם אחת?", type: "multiple_choice", options: options("יותר מדי רגיש/ה", "קצת סגור/ה", "יותר מדי עצמאי/ת", "מאוד אינטנסיבי/ת"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q09", prompt: "כשאתה/את מדמיין/ת יחסים אידיאליים, הם נראים כך", type: "multiple_choice", options: options("הכל כמעט ביחד", "לכל אחד עולם משלו", "גדלים ומאתגרים יחד", "נהנים בלי סיבוך"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q10", prompt: "איך אתה/את מגיב/ה כשבן/בת זוג צריך/ה הרבה ממך רגשית?", type: "multiple_choice", options: options("נותן/ת", "מנסה אבל מתעייף/ת", "נסגר/ת", "תלוי בצורך"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q11", prompt: "כמה זמן לוקח לך להרגיש בנוח לחשוף חולשות?", type: "multiple_choice", options: options("מהר מאוד", "כמה חודשים", "רק אחרי אמון מלא", "קשה לי עם זה"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q12", prompt: "מה יותר חשוב בשלב הראשון של היכרות?", type: "multiple_choice", options: options("כימיה פיזית", "שיחה שמרגשת", "תחושת ביטחון", "צחוק ואווירה"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q13", prompt: "אם היית מתאר/ת את עצמך בקשר במשפט אחד", type: "multiple_choice", options: options("נותן/ת הרבה", "קשה להשגה", "מאוד נאמן/ה", "כיפי/ת וקשה עם שגרה"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q14", prompt: "מה יגרום לך לברוח מקשר שהתחיל טוב?", type: "multiple_choice", options: options("מנסים לשנות אותי", "מרגיש/ה לבד", "אין צמיחה", "אין מרחב אישי"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q15", prompt: "בסולם 1-4, כמה אתה/את בררן/ית?", type: "multiple_choice", options: options("1", "2", "3", "4"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q16", prompt: "מה קורה כשאתה/את רגיל/ה למישהו/י והוא/היא יוצא/ת מהתמונה?", type: "multiple_choice", options: options("קשה מאוד", "עצוב אבל ממשיך/ה", "מנסה להבין", "שם/ה קיר"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q17", prompt: "מה מפעיל אותך הכי הרבה במישהו/י?", type: "multiple_choice", options: options("ביטחון עצמי", "חוש הומור", "עומק ואינטליגנציה", "חמימות ועדינות"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q18", prompt: "היית עם מישהו/י שלא ממש מתאים/ה לך, למה?", type: "multiple_choice", options: options("פחדתי להיות לבד", "הייתה כימיה", "חשבתי שישתנה", "זה לא קרה לי"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q19", prompt: "מה המשמעות של מערכת יחסים בריאה עבורך?", type: "multiple_choice", options: options("בוחרים כל יום", "להיות עצמם לגמרי", "בונים עתיד ברור", "נהנים מהדרך"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q20", prompt: "מה הכי קשה לך לבקש בקשר?", type: "multiple_choice", options: options("עזרה", "מרחב", "קרבה", "שיוציאו אותי מהראש"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q21", prompt: "מה גורם לך להרגיש שמישהו/י באמת אוהב/ת אותך?", type: "multiple_choice", options: options("בוחר/ת בי שוב ושוב", "מכיר/ה אותי לעומק", "שם/ה בזמנים קשים", "גורם/ת לי לצחוק"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q22", prompt: "משפט אחד שמסכם אותך עכשיו", type: "multiple_choice", options: options("מוכן/ה למצוא", "לא בטוח/ה אבל רוצה", "עברתי הרבה", "עדיין מגלה"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
      ],
    },
  ],
};
```

- [ ] **Step 5: Create matching questionnaire seed**

Create `src/data/seeds/matching-questionnaire.ts`. Include all 95 stable question records with source-derived prompts. Open questions from the source document should be type `open_text`.

Use this exact shape:

```ts
import type { QuestionnaireSeed } from "./report-questionnaire";

const mc = (stableKey: string, prompt: string) => ({
  stableKey,
  prompt,
  type: "multiple_choice" as const,
  options: [
    { label: "א", value: "a" },
    { label: "ב", value: "b" },
    { label: "ג", value: "c" },
    { label: "ד", value: "d" },
  ],
  usageFlags: { matchingInput: true },
});

const open = (stableKey: string, prompt: string) => ({
  stableKey,
  prompt,
  type: "open_text" as const,
  usageFlags: { matchingInput: true },
});

const blockA = [
  "כשאתה/את מרגיש/ה כאב רגשי, מה אתה/את עושה?",
  "מה יותר מהר שובר אותך, ביקורת או התעלמות?",
  "כשמישהו/י כועס/ת עליך, מה התגובה הספונטנית שלך?",
  "מה אתה/את עושה עם קנאה כשהיא מגיעה?",
  "מה יותר קשה, לקבל סליחה או לתת אותה?",
  "כשקשה לך, האם אתה/את מבקש/ת עזרה?",
  "מה מרגיש לך יותר בטוח, לאהוב או להיות אהוב/ה?",
  "כמה פעמים נפגעת באמת בקשרים שהיו לך?",
  "האם אתה/את מאמין/ה שאפשר לאהוב שוב אחרי פגיעה גדולה?",
  "מה יותר מדויק, אתה/את אדם שנותן/ת אהבה בקלות או שמרוויח/ה אותה?",
  "האם קרה לך שאהבת מישהו/י שפגע בך שוב ושוב?",
  "מה גורם לך יותר להיסגר, כשמישהו/י צועק, בוכה, או נסגר בעצמו/ה?",
  "האם אי פעם הרגשת שאתה/את אוהב/ת יותר ממה שאוהבים אותך?",
  "כשאתה/את מאושר/ת בקשר, מה זה נראה?",
  "האם אתה/את מי שמחזיק/ה טינה?",
  "מה אתה/את עושה עם ציפיות לא מדוברות שנשברות?",
  "האם אהבה ראשונה עדיין משפיעה עליך?",
  "מה אתה/את יותר, רגשי/ת או הגיוני/ת בתוך קשר?",
  "כשאתה/את מרגיש/ה בדידות בתוך קשר, מה קורה?",
  "מה יגרום לך לרצות לעצור הכל ולהישאר?",
  "כמה מהר אתה/את נופל/ת לאהבה?",
  "מה עושה אותך פגיע/ה ביותר בקשר?",
  "האם קרה שנפרדת ממישהו/י שבאמת אהבת כי פחדת?",
  "מה הכי פוגע בגאוותך בקשר?",
  "מה יותר קל לך, לסלוח על בגידה או על שקר?",
  "האם אתה/את מי שמרגיש/ה אשמה בקלות?",
  "מה קורה לך כשבן/בת זוג זקוק/ה לך ואתה/את פשוט לא שם/ה רגשית?",
  "מה יותר מקרב אותך לאדם, שהוא/היא חלש/ה בפנייך או חזק/ה?",
  "האם אתה/את מי שמסוגל/ת לאהוב בלי לאבד את עצמו/ה?",
  "משפט שמסכם את מערכת הרגשות שלך",
];

const blockB = [
  "מה הדבר הראשון שאתה/את שם/ה לב אליו בפגישה ראשונה?",
  "מה אתה/את עושה עם שתיקה אי-נוחה?",
  "האם אתה/את אדם שמתקשר/ת הרבה בזוגיות?",
  "מה יותר קשה, לדבר על צרכים או לדבר על פחדים?",
  "האם אתה/את אומר/ת אני אוהב/ת אותך בקלות?",
  "מה מזהה אצלך שיחה טובה?",
  "אתה/את מי שמגדיר/ה גבולות בקלות?",
  "מה אתה/את עושה כשמישהו/י חוצה גבול שלך?",
  "כמה ימים של לא לדבר עם בן/בת זוג גורמים לך לחרדה?",
  "מה אתה/את עושה כשבן/בת זוג שולח/ת הודעה ולא מקבל/ת תגובה שעות?",
  "האם אתה/את שמרן/ית בבחירה של בן/בת זוג?",
  "מה יותר חשוב, כימיה פיזית או תאימות ערכים?",
  "כשאתה/את יוצא/ת לדייט, מה מרגיש אותך לפני?",
  "האם אתה/את מדמיין/ת את עצמך עם האדם השני כבר בדייט ראשון?",
  "מה אתה/את עושה אחרי דייט שלא לקח לשום מקום?",
  "מה הכי מוציא/ה אותך מאיזון בתוך קשר?",
  "מה אתה/את עושה כשמרגיש/ה בדידות בחיים?",
  "האם אי פעם הצגת עצמך אחרת ממה שאתה/את כדי שמישהו/י יאהב אותך?",
  "מה יותר קשה, להתחיל קשר חדש או לסיים אחד ישן?",
  "כמה זמן אחרי פרידה אתה/את מוכן/ה לחזור לחפש?",
  "מה אתה/את עושה עם דעות שונות על חשיבות הדברים?",
  "האם אתה/את אדם שמדבר/ת על הקשר עצמו?",
  "מה אתה/את מצפה מבן/בת זוג בזמנים קשים?",
  "האם אתה/את יכול/ה לבקש אני צריך/ה חיבוק?",
  "מה אתה/את עושה כשבן/בת זוג מסרב/ת לתת לך מה שביקשת?",
  "כמה חשוב לך שבן/בת זוג יאהב/ת את החברים שלך?",
  "מה אתה/את עושה כשהחברים/ות שלך לא אוהבים/ות את הבחירה שלך?",
  "האם אתה/את מביא/ה את העבר לתוך קשר נוכחי?",
  "מה אומר עליך שאתה/את שותק/ת בקשר?",
  "מה הכי קשה לך לקבל ממישהו/י שאתה/את אוהב/ת?",
  "האם אתה/את בוחן/ת אנשים לפני שאתה/את בוטח/ת?",
  "מה יותר קל לך, לאהוב בצורה גדולה או לאהוב בצורה יציבה?",
  "האם אתה/את מי שזוכר/ת יום הולדת, תאריכים, פרטים קטנים?",
  "מה יותר חשוב, שבן/בת זוג יהיה/תהיה שאפתן/ית או מאוזן/ת?",
  "מה בדרך כלל גורם לך לאמון לנשבר?",
];

const blockC = [
  "מה המשמעות של בית עבורך?",
  "האם אתה/את רוצה ילדים?",
  "מה הדמות שאתה/את רוצה להיות בתוך משפחה?",
  "מה חשוב לך שיהיה לך גם בזוגיות?",
  "כמה שנים אתה/את מוכן/ה לתת לקשר להתפתח לפני שאתה/את מחפש/ת מחויבות?",
  "מה אתה/את עושה כשפוגש/ת מישהו/י שמושך/ת אותך אבל לא ממש מתאים/ה?",
  "מה הדבר שאתה/את לא מוכן/ה לוותר עליו בבחירת בן/בת זוג?",
  "מה אתה/את מוכן/ה לוותר עליו כדי לבנות קשר?",
  "האם אתה/את מוכן/ה לקשר עם ילדים מנישואים קודמים?",
  "מה מוציא/ה אותך מהר ממשוואה רומנטית?",
  "האם אי פעם פגשת את הנכון/ה ופספסת?",
  "מה החלום שלך לקשר בעוד 10 שנים?",
  "מה עוצר אותך היום ממציאת זוגיות?",
  "מה אתה/את עושה שונה מהפעמים הקודמות שחיפשת?",
  "מה הסיבה האמיתית לדעתך שעד היום לא הגעת לאיפה שרצית?",
  "מה יגרום לך להגיד זה הוא/היא?",
  "האם אתה/את מסוגל/ת לבחור בצורה מודעת, לא רק מתוך כימיה?",
  "מה הדבר שאתה/את הכי פוחד/ת שיקרה בקשר הבא?",
  "מה אתה/את מציע/ה לקשר, מה הערך שלך?",
  "האם אתה/את מאמין/ה שיש זיווג, האחד?",
  "מה יותר חשוב, שיאהבו אותך כפי שאתה/את, או שתצמח/י בזכות הקשר?",
  "מה סוג הקשר שאתה/את מחפש/ת?",
  "כמה חשוב שבן/בת זוג ידע/תדע על העבר שלך?",
  "האם אתה/את מאמין/ה שאנשים יכולים לשנות?",
  "מה גורם לך להאמין שהפעם יהיה שונה?",
  "האם אתה/את מוכן/ה לעבוד על קשר גם כשקשה?",
  "מה היית אומר/ת לעצמך לפני 5 שנים על אהבה?",
  "מה תאמר/י לעצמך בעוד 5 שנים אם עוד לא מצאת?",
  "מה אתה/את רוצה שהמנגנון של lovlov ידע עליך שעדיין לא שאלנו?",
  "אם היה לך רק משפט אחד לתאר את מה שאתה/את מחפש/ת, מה הוא?",
];

const openQuestionNumbers = new Set([72, 79, 92, 93, 94, 95]);

const toQuestions = (prompts: string[], startNumber: number) =>
  prompts.map((prompt, index) => {
    const number = startNumber + index;
    const stableKey = `match_q${String(number).padStart(2, "0")}`;
    return openQuestionNumbers.has(number) ? open(stableKey, prompt) : mc(stableKey, prompt);
  });

export const matchingQuestionnaireSeed: QuestionnaireSeed = {
  slug: "matching-depth-v1",
  title: "שאלון עומק להתאמה ושידוך חכם",
  purpose: "matching",
  blocks: [
    {
      title: "עולם הרגשות והצללים",
      questions: toQuestions(blockA, 1),
    },
    {
      title: "דפוסי קשר ותקשורת",
      questions: toQuestions(blockB, 31),
    },
    {
      title: "חזון זוגיות ועתיד",
      questions: toQuestions(blockC, 66),
    },
  ],
};
```

- [ ] **Step 6: Run test to verify it passes**

Run:

```bash
npm test -- tests/unit/seed-data.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/data/seeds tests/unit/seed-data.test.ts
git commit -m "feat: add questionnaire and archetype seeds"
```

## Task 4: Payment State Machine

**Files:**

- Create: `src/domain/payments/types.ts`
- Create: `src/domain/payments/payment-state.ts`
- Create: `src/domain/payments/upay-adapter.ts`
- Test: `tests/unit/payment-state.test.ts`

- [ ] **Step 1: Write failing payment state tests**

Create `tests/unit/payment-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyPaymentEvent } from "../../src/domain/payments/payment-state";

describe("applyPaymentEvent", () => {
  it("marks payment paid only when amount and currency match", () => {
    const result = applyPaymentEvent(
      { status: "pending", amountMinor: 9900, currency: "ILS", providerReference: "abc" },
      { type: "paid", amountMinor: 9900, currency: "ILS", providerReference: "abc" },
    );

    expect(result.status).toBe("paid");
  });

  it("rejects mismatched amount", () => {
    expect(() =>
      applyPaymentEvent(
        { status: "pending", amountMinor: 9900, currency: "ILS", providerReference: "abc" },
        { type: "paid", amountMinor: 100, currency: "ILS", providerReference: "abc" },
      ),
    ).toThrow("Payment amount mismatch");
  });

  it("is idempotent for duplicate paid events", () => {
    const result = applyPaymentEvent(
      { status: "paid", amountMinor: 9900, currency: "ILS", providerReference: "abc" },
      { type: "paid", amountMinor: 9900, currency: "ILS", providerReference: "abc" },
    );

    expect(result.status).toBe("paid");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/payment-state.test.ts
```

Expected: FAIL because payment domain files do not exist.

- [ ] **Step 3: Implement payment types and state machine**

Create `src/domain/payments/types.ts`:

```ts
export type PaymentStatus = "created" | "pending" | "paid" | "failed" | "cancelled";

export type PaymentRecord = {
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  providerReference: string;
};

export type PaymentEvent =
  | { type: "paid"; amountMinor: number; currency: string; providerReference: string }
  | { type: "failed"; providerReference: string; reason: string }
  | { type: "cancelled"; providerReference: string };
```

Create `src/domain/payments/payment-state.ts`:

```ts
import type { PaymentEvent, PaymentRecord } from "./types";

export function applyPaymentEvent(record: PaymentRecord, event: PaymentEvent): PaymentRecord {
  if (record.providerReference !== event.providerReference) {
    throw new Error("Payment reference mismatch");
  }

  if (event.type === "paid") {
    if (record.amountMinor !== event.amountMinor) {
      throw new Error("Payment amount mismatch");
    }
    if (record.currency !== event.currency) {
      throw new Error("Payment currency mismatch");
    }
    return { ...record, status: "paid" };
  }

  if (record.status === "paid") {
    return record;
  }

  return { ...record, status: event.type };
}
```

Create `src/domain/payments/upay-adapter.ts`:

```ts
export type CreatePaymentInput = {
  quizSessionId: string;
  amountMinor: number;
  currency: "ILS";
  successUrl: string;
  cancelUrl: string;
};

export type CreatedPayment = {
  providerReference: string;
  redirectUrl: string;
};

export interface UPayAdapter {
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>;
  verifyWebhook(headers: Headers, body: string): Promise<boolean>;
}

export class MockUPayAdapter implements UPayAdapter {
  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    return {
      providerReference: `mock-${input.quizSessionId}`,
      redirectUrl: `${input.successUrl}?mockPayment=paid`,
    };
  }

  async verifyWebhook(): Promise<boolean> {
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/unit/payment-state.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/payments tests/unit/payment-state.test.ts
git commit -m "feat: add payment state machine"
```

## Task 5: AI Report Prompt Assembly And Validation

**Files:**

- Create: `src/domain/reports/types.ts`
- Create: `src/domain/reports/prompt.ts`
- Create: `src/domain/reports/report-output.ts`
- Test: `tests/unit/report-generation.test.ts`

- [ ] **Step 1: Write failing report tests**

Create `tests/unit/report-generation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assembleReportPrompt } from "../../src/domain/reports/prompt";
import { validateReportOutput } from "../../src/domain/reports/report-output";

describe("report generation", () => {
  it("injects answer and archetype variables into prompt template", () => {
    const prompt = assembleReportPrompt({
      template: "שם: {{displayName}}\nארכיטיפ: {{archetypeName}}\nתשובות: {{answersJson}}",
      displayName: "רוני",
      archetypeName: "החם הנסגר",
      answers: [{ question: "מה מפחיד אותך?", answer: "להתאכזב שוב" }],
    });

    expect(prompt).toContain("שם: רוני");
    expect(prompt).toContain("החם הנסגר");
    expect(prompt).toContain("להתאכזב שוב");
  });

  it("accepts report output with required sections", () => {
    const result = validateReportOutput({
      title: "הזהות הזוגית שלי",
      profileSummary: "סיכום",
      blockers: ["פחד מאכזבה"],
      accelerators: ["תקשורת ישירה"],
      actionPlan: ["תרגול שיחה"],
      disclaimer: "זהו דוח תובנות ואינו אבחון רפואי או טיפולי.",
    });

    expect(result.title).toBe("הזהות הזוגית שלי");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/report-generation.test.ts
```

Expected: FAIL because report domain files do not exist.

- [ ] **Step 3: Implement prompt assembly and validation**

Create `src/domain/reports/types.ts`:

```ts
export type ReportAnswerInput = {
  question: string;
  answer: string;
};

export type ReportPromptInput = {
  template: string;
  displayName: string;
  archetypeName: string;
  answers: ReportAnswerInput[];
};
```

Create `src/domain/reports/prompt.ts`:

```ts
import type { ReportPromptInput } from "./types";

export function assembleReportPrompt(input: ReportPromptInput): string {
  return input.template
    .replaceAll("{{displayName}}", input.displayName)
    .replaceAll("{{archetypeName}}", input.archetypeName)
    .replaceAll("{{answersJson}}", JSON.stringify(input.answers, null, 2));
}
```

Create `src/domain/reports/report-output.ts`:

```ts
import { z } from "zod";

export const reportOutputSchema = z.object({
  title: z.string().min(1),
  profileSummary: z.string().min(1),
  blockers: z.array(z.string().min(1)).min(1),
  accelerators: z.array(z.string().min(1)).min(1),
  actionPlan: z.array(z.string().min(1)).min(1),
  disclaimer: z.string().includes("אינו אבחון"),
});

export type ReportOutput = z.infer<typeof reportOutputSchema>;

export function validateReportOutput(value: unknown): ReportOutput {
  return reportOutputSchema.parse(value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/unit/report-generation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/reports tests/unit/report-generation.test.ts
git commit -m "feat: add report prompt assembly"
```

## Task 6: Registration Claim Tokens

**Files:**

- Create: `src/domain/claims/claim-token.ts`
- Test: `tests/unit/claim-token.test.ts`

- [ ] **Step 1: Write failing claim token tests**

Create `tests/unit/claim-token.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createClaimToken, canClaimToken } from "../../src/domain/claims/claim-token";

describe("claim tokens", () => {
  it("creates a raw token and separate hash", async () => {
    const token = await createClaimToken();

    expect(token.rawToken.length).toBeGreaterThan(24);
    expect(token.tokenHash).not.toBe(token.rawToken);
  });

  it("rejects expired or already claimed tokens", () => {
    const now = new Date("2026-06-01T12:00:00Z");

    expect(canClaimToken({ expiresAt: new Date("2026-06-01T12:05:00Z"), claimedAt: null }, now)).toBe(true);
    expect(canClaimToken({ expiresAt: new Date("2026-06-01T11:59:00Z"), claimedAt: null }, now)).toBe(false);
    expect(canClaimToken({ expiresAt: new Date("2026-06-01T12:05:00Z"), claimedAt: now }, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/claim-token.test.ts
```

Expected: FAIL because claim token module does not exist.

- [ ] **Step 3: Implement token helpers**

Create `src/domain/claims/claim-token.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";

export async function createClaimToken() {
  const rawToken = randomBytes(32).toString("base64url");
  return {
    rawToken,
    tokenHash: hashClaimToken(rawToken),
  };
}

export function hashClaimToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function canClaimToken(
  token: { expiresAt: Date; claimedAt: Date | null },
  now: Date,
): boolean {
  return token.claimedAt === null && token.expiresAt.getTime() > now.getTime();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/unit/claim-token.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/claims tests/unit/claim-token.test.ts
git commit -m "feat: add registration claim tokens"
```

## Task 7: Matching Engine Core

**Files:**

- Create: `src/domain/matching/types.ts`
- Create: `src/domain/matching/scoring.ts`
- Test: `tests/unit/matching.test.ts`

- [ ] **Step 1: Write failing matching tests**

Create `tests/unit/matching.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calculateMatchScore, passesHardFilters } from "../../src/domain/matching/scoring";

describe("matching", () => {
  it("rejects users outside hard filters", () => {
    expect(
      passesHardFilters(
        { userId: "a", birthYear: 1990, interestedIn: "women", gender: "man", relationshipIntention: "serious", blockedUserIds: [] },
        { userId: "b", birthYear: 1995, interestedIn: "men", gender: "woman", relationshipIntention: "casual", blockedUserIds: [] },
      ),
    ).toBe(false);
  });

  it("calculates symmetric weighted score from numeric traits", () => {
    const score = calculateMatchScore({
      a: {
        userId: "a",
        traits: { emotional_depth: 80, communication_directness: 70 },
      },
      b: {
        userId: "b",
        traits: { emotional_depth: 90, communication_directness: 50 },
      },
      weights: { emotional_depth: 60, communication_directness: 40 },
    });

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBe(88);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/matching.test.ts
```

Expected: FAIL because matching module does not exist.

- [ ] **Step 3: Implement matching core**

Create `src/domain/matching/types.ts`:

```ts
export type MatchProfile = {
  userId: string;
  birthYear?: number;
  gender?: string;
  interestedIn?: string;
  relationshipIntention?: string;
  blockedUserIds?: string[];
  traits?: Record<string, number>;
};

export type WeightedScoreInput = {
  a: Pick<MatchProfile, "userId" | "traits">;
  b: Pick<MatchProfile, "userId" | "traits">;
  weights: Record<string, number>;
};
```

Create `src/domain/matching/scoring.ts`:

```ts
import type { MatchProfile, WeightedScoreInput } from "./types";

export function passesHardFilters(a: MatchProfile, b: MatchProfile): boolean {
  if (a.blockedUserIds?.includes(b.userId) || b.blockedUserIds?.includes(a.userId)) {
    return false;
  }

  if (a.relationshipIntention && b.relationshipIntention && a.relationshipIntention !== b.relationshipIntention) {
    return false;
  }

  if (a.interestedIn && b.gender && a.interestedIn !== b.gender) {
    return false;
  }

  if (b.interestedIn && a.gender && b.interestedIn !== a.gender) {
    return false;
  }

  return true;
}

export function calculateMatchScore(input: WeightedScoreInput): number {
  const activeWeights = Object.entries(input.weights).filter(([, weight]) => weight > 0);
  const totalWeight = activeWeights.reduce((sum, [, weight]) => sum + weight, 0);

  if (totalWeight <= 0) {
    return 0;
  }

  const score = activeWeights.reduce((sum, [traitKey, weight]) => {
    const aValue = input.a.traits?.[traitKey] ?? 0;
    const bValue = input.b.traits?.[traitKey] ?? 0;
    const distance = Math.abs(aValue - bValue);
    const traitScore = Math.max(0, 100 - distance);
    return sum + traitScore * (weight / totalWeight);
  }, 0);

  return Math.round(score);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/unit/matching.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/matching tests/unit/matching.test.ts
git commit -m "feat: add matching score engine"
```

## Task 8: Chat Permission Core

**Files:**

- Create: `src/domain/chat/permissions.ts`
- Test: `tests/unit/chat-permissions.test.ts`

- [ ] **Step 1: Write failing chat permission tests**

Create `tests/unit/chat-permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canSendMessage } from "../../src/domain/chat/permissions";

describe("canSendMessage", () => {
  it("allows active matched conversation participants", () => {
    expect(
      canSendMessage({
        senderId: "a",
        conversationStatus: "active",
        matchStatus: "active",
        participants: ["a", "b"],
        blockedPairs: [],
      }),
    ).toBe(true);
  });

  it("rejects blocked conversations", () => {
    expect(
      canSendMessage({
        senderId: "a",
        conversationStatus: "blocked",
        matchStatus: "active",
        participants: ["a", "b"],
        blockedPairs: [],
      }),
    ).toBe(false);
  });

  it("rejects when either participant blocked the other", () => {
    expect(
      canSendMessage({
        senderId: "a",
        conversationStatus: "active",
        matchStatus: "active",
        participants: ["a", "b"],
        blockedPairs: [["b", "a"]],
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/chat-permissions.test.ts
```

Expected: FAIL because chat module does not exist.

- [ ] **Step 3: Implement chat permission function**

Create `src/domain/chat/permissions.ts`:

```ts
export type CanSendMessageInput = {
  senderId: string;
  participants: [string, string];
  conversationStatus: "active" | "blocked" | "disabled";
  matchStatus: "active" | "hidden" | "blocked";
  blockedPairs: [string, string][];
};

export function canSendMessage(input: CanSendMessageInput): boolean {
  if (!input.participants.includes(input.senderId)) {
    return false;
  }

  if (input.conversationStatus !== "active" || input.matchStatus !== "active") {
    return false;
  }

  const [a, b] = input.participants;
  return !input.blockedPairs.some(
    ([blocker, blocked]) =>
      (blocker === a && blocked === b) || (blocker === b && blocked === a),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/unit/chat-permissions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/chat tests/unit/chat-permissions.test.ts
git commit -m "feat: add chat permission rules"
```

## Task 9: Minimal User-Facing Pages

**Files:**

- Modify: `src/app/quiz/page.tsx`
- Create: `src/app/report/[token]/page.tsx`
- Create: `src/app/register/page.tsx`
- Create: `src/app/matching/questionnaire/page.tsx`
- Create: `src/app/matches/page.tsx`
- Create: `src/app/chat/[conversationId]/page.tsx`
- Test: `tests/e2e/user-flow.spec.ts`

- [ ] **Step 1: Write failing e2e smoke test**

Create `tests/e2e/user-flow.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("user can navigate the phase 1 flow", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "להתחלת השאלון" }).click();
  await expect(page.getByRole("heading", { name: "שאלון ראשוני" })).toBeVisible();

  await page.goto("/report/mock-token");
  await expect(page.getByRole("heading", { name: "הדוח האישי שלך" })).toBeVisible();
  await expect(page.getByRole("link", { name: "להרשמה והמשך התאמות" })).toBeVisible();

  await page.goto("/matches");
  await expect(page.getByRole("heading", { name: "ההתאמות שלך" })).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run e2e -- tests/e2e/user-flow.spec.ts
```

Expected: FAIL because pages do not exist.

- [ ] **Step 3: Create minimal pages**

Create `src/app/quiz/page.tsx`:

```tsx
import { reportQuestionnaireSeed } from "@/data/seeds/report-questionnaire";

export default function QuizPage() {
  const questions = reportQuestionnaireSeed.blocks.flatMap((block) => block.questions);

  return (
    <main className="page-shell">
      <h1>שאלון ראשוני</h1>
      <ol>
        {questions.slice(0, 3).map((question) => (
          <li key={question.stableKey}>{question.prompt}</li>
        ))}
      </ol>
    </main>
  );
}
```

Create `src/app/report/[token]/page.tsx`:

```tsx
import Link from "next/link";

export default function ReportPage() {
  return (
    <main className="page-shell">
      <h1>הדוח האישי שלך</h1>
      <p>כאן יוצג הדוח שנוצר לאחר תשלום מאומת.</p>
      <Link className="primary-link" href="/register">
        להרשמה והמשך התאמות
      </Link>
    </main>
  );
}
```

Create `src/app/register/page.tsx`:

```tsx
export default function RegisterPage() {
  return (
    <main className="page-shell">
      <h1>הרשמה</h1>
      <p>החשבון החדש יקושר לדוח ששולם באמצעות אסימון הרשמה מאובטח.</p>
    </main>
  );
}
```

Create `src/app/matching/questionnaire/page.tsx`:

```tsx
export default function MatchingQuestionnairePage() {
  return (
    <main className="page-shell">
      <h1>שאלון עומק להתאמה</h1>
      <p>שאלון זה זמין למשתמשים רשומים בלבד.</p>
    </main>
  );
}
```

Create `src/app/matches/page.tsx`:

```tsx
export default function MatchesPage() {
  return (
    <main className="page-shell">
      <h1>ההתאמות שלך</h1>
      <p>כאן יוצגו התאמות מדורגות לאחר השלמת שאלון העומק.</p>
    </main>
  );
}
```

Create `src/app/chat/[conversationId]/page.tsx`:

```tsx
export default function ChatPage() {
  return (
    <main className="page-shell">
      <h1>צ׳אט</h1>
      <p>צ׳אט חי בין משתמשים מותאמים.</p>
    </main>
  );
}
```

- [ ] **Step 4: Run e2e test to verify it passes**

Run:

```bash
npm run e2e -- tests/e2e/user-flow.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app tests/e2e/user-flow.spec.ts
git commit -m "feat: add phase 1 user pages"
```

## Task 10: Minimal Admin Dashboard

**Files:**

- Create: `src/app/admin/page.tsx`
- Test: `tests/e2e/admin.spec.ts`

- [ ] **Step 1: Write failing admin e2e test**

Create `tests/e2e/admin.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("admin dashboard shows configurable business areas", async ({ page }) => {
  await page.goto("/admin");

  await expect(page.getByRole("heading", { name: "ניהול lovlov.me" })).toBeVisible();
  await expect(page.getByText("שאלונים")).toBeVisible();
  await expect(page.getByText("פרומפטים ודוחות")).toBeVisible();
  await expect(page.getByText("התאמות")).toBeVisible();
  await expect(page.getByText("צ׳אט ודיווחים")).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run e2e -- tests/e2e/admin.spec.ts
```

Expected: FAIL because admin page does not exist.

- [ ] **Step 3: Create admin dashboard shell**

Create `src/app/admin/page.tsx`:

```tsx
const adminAreas = [
  "שאלונים",
  "ארכיטיפים",
  "פרומפטים ודוחות",
  "תשלומים",
  "משתמשים",
  "התאמות",
  "צ׳אט ודיווחים",
];

export default function AdminPage() {
  return (
    <main className="page-shell">
      <h1>ניהול lovlov.me</h1>
      <div className="admin-grid">
        {adminAreas.map((area) => (
          <section key={area} className="admin-tile">
            <h2>{area}</h2>
          </section>
        ))}
      </div>
    </main>
  );
}
```

Add to `src/app/globals.css`:

```css
.admin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}

.admin-tile {
  border: 1px solid #ded8d0;
  border-radius: 8px;
  padding: 16px;
  background: white;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run e2e -- tests/e2e/admin.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin src/app/globals.css tests/e2e/admin.spec.ts
git commit -m "feat: add admin dashboard shell"
```

## Task 11: Phase 1 Verification

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

- [ ] **Step 3: Run e2e tests**

Run:

```bash
npm run e2e
```

Expected: PASS.

- [ ] **Step 4: Start dev server for manual review**

Run:

```bash
npm run dev
```

Expected: server starts on `http://localhost:3000`.

- [ ] **Step 5: Manual browser checks**

Open:

- `http://localhost:3000`
- `http://localhost:3000/quiz`
- `http://localhost:3000/report/mock-token`
- `http://localhost:3000/register`
- `http://localhost:3000/matches`
- `http://localhost:3000/admin`

Expected: pages render RTL Hebrew content without layout overlap.

- [ ] **Step 6: Commit final verification fixes**

If verification required fixes, run:

```bash
git add .
git commit -m "fix: complete phase 1 verification"
```

If no fixes were needed, do not create an empty commit.

## Self-Review Notes

Spec coverage:

- Guest paid report flow: covered by schema, quiz page, payment state machine, report prompt, claim token.
- UPay: covered by adapter interface and idempotent state machine; real provider wiring is assigned to the provider integration plan.
- OpenAI: covered by prompt assembly and validated structured output; final prompt remains product-owner input.
- Configurable 22/95 questionnaires: covered by versioned schema and seeds.
- Admin panel: covered by admin shell and schema; full CRUD is assigned to the admin CRUD plan.
- Matching: covered by normalized trait tables and initial score engine.
- Chat: covered by schema and permission rules; realtime UI is assigned to the chat UI plan.
- Security: covered by RLS-enabled schema and service-role warning in spec; detailed policies should be expanded in Phase 2.

The 95-question seed preserves count, stable keys, block structure, and source-derived prompts from the product document. Content QA can refine Hebrew wording without changing schema or code contracts.
