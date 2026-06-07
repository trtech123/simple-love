import type { BrowserContext } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd(), false, { info: () => undefined, error: console.error });

type SetCookie = {
  name: string;
  value: string;
  options?: {
    path?: string;
    sameSite?: "lax" | "strict" | "none";
    httpOnly?: boolean;
    secure?: boolean;
    maxAge?: number;
  };
};
type PlaywrightCookie = Parameters<BrowserContext["addCookies"]>[0][number];
type SupabaseCookieSameSite = NonNullable<SetCookie["options"]>["sameSite"];

export type E2eAdminAccount = {
  email: string;
  password: string;
  userId: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = "http://127.0.0.1:3100";

function requireSupabaseE2eConfig() {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
  };
}

export async function createE2eAdminAccount(): Promise<E2eAdminAccount> {
  const config = requireSupabaseE2eConfig();
  const admin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `e2e-admin-${unique}@example.invalid`;
  const password = `e2e-admin-${unique}-Password1`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "admin" },
  });

  if (error || !data.user) {
    throw new Error(`Failed to create E2E admin user: ${error?.message ?? "No user returned"}`);
  }

  return {
    email,
    password,
    userId: data.user.id,
  };
}

export async function deleteE2eAdminAccount(account: E2eAdminAccount | undefined) {
  if (!account) return;

  const config = requireSupabaseE2eConfig();
  const admin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  await admin.auth.admin.deleteUser(account.userId);
}

export async function signInE2eAdmin(context: BrowserContext, account: E2eAdminAccount) {
  const config = requireSupabaseE2eConfig();
  const cookiesToSet: SetCookie[] = [];
  const client = createBrowserClient(config.supabaseUrl, config.supabaseAnonKey, {
    cookies: {
      getAll: () => [],
      setAll: (cookies: SetCookie[]) => {
        cookiesToSet.push(...cookies);
      },
    },
  });

  const { error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });

  if (error) {
    throw new Error(`Failed to sign in E2E admin user: ${error.message}`);
  }

  const playwrightCookies = cookiesToSet.map((cookie) => {
    const mappedCookie: PlaywrightCookie = {
      name: cookie.name,
      value: cookie.value,
      url: baseUrl,
    };

    if (cookie.options?.httpOnly !== undefined) mappedCookie.httpOnly = cookie.options.httpOnly;
    if (cookie.options?.secure !== undefined) mappedCookie.secure = cookie.options.secure;
    if (cookie.options?.sameSite !== undefined) mappedCookie.sameSite = toPlaywrightSameSite(cookie.options.sameSite);

    return mappedCookie;
  });

  await context.addCookies(playwrightCookies);
}

function toPlaywrightSameSite(sameSite: SupabaseCookieSameSite): NonNullable<PlaywrightCookie["sameSite"]> {
  if (sameSite === "strict") return "Strict";
  if (sameSite === "none") return "None";
  return "Lax";
}
