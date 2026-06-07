import { describe, expect, it } from "vitest";
import { readEnv } from "../../src/lib/env";

describe("readEnv", () => {
  it("returns typed environment settings from a provided source", () => {
    const env = readEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      OPENAI_API_KEY: "openai",
      CHING_API_BASE: "https://api.ching.co.il",
      CHING_API_KEY: "ck_test_key",
      CHING_WEBHOOK_SECRET: "whsec_secret",
      APP_BASE_URL: "http://localhost:3000",
    });

    expect(env.appBaseUrl).toBe("http://localhost:3000");
    expect(env.supabase.url).toBe("https://example.supabase.co");
    expect(env.ching.apiBase).toBe("https://api.ching.co.il");
    expect(env.ching.webhookSecret).toBe("whsec_secret");
  });

  it("throws a useful error when a required variable is missing", () => {
    expect(() => readEnv({})).toThrow("Missing environment variable: APP_BASE_URL");
  });
});
