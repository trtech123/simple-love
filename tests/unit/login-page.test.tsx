import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

const authMocks = vi.hoisted(() => ({
  push: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: authMocks.push }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: authMocks.signInWithPassword,
      signInWithOAuth: authMocks.signInWithOAuth,
    },
  }),
}));

describe("/login page", () => {
  it("renders Hebrew RTL login copy, fields, Google button, and preserves a safe next path", async () => {
    const Page = (await import("../../src/app/login/page")).default;
    const element = await Page({ searchParams: Promise.resolve({ next: "/chat/conversation-1" }) });
    const html = renderToString(element);

    expect(html).toContain('dir="rtl"');
    expect(html).toContain("ברוכה השבה");
    expect(html).toContain("התחברות עם Google");
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
    expect(html).toContain('value="/chat/conversation-1"');
  });

  it("falls back to matches for unsafe next values and renders OAuth callback errors", async () => {
    const Page = (await import("../../src/app/login/page")).default;
    const element = await Page({
      searchParams: Promise.resolve({ next: "https://evil.example/path", error: "missing_code" }),
    });
    const html = renderToString(element);

    expect(html).toContain('value="/matches"');
    expect(html).toContain("לא הצלחנו להשלים את ההתחברות עם Google");
    expect(html).not.toContain("https://evil.example/path");
  });
});
