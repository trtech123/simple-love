import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: vi.fn(),
      signInWithOAuth: vi.fn(),
    },
  }),
}));

describe("/register page", () => {
  it("renders Hebrew RTL claim copy with Google as the primary action", async () => {
    const Page = (await import("../../src/app/register/page")).default;
    const element = await Page({ searchParams: Promise.resolve({ claim: "claim-token" }) });
    const html = renderToString(element);

    expect(html).toContain('dir="rtl"');
    expect(html).toContain("יצירת חשבון אחרי התשלום");
    expect(html).toContain("הדוח נשמר באזור האישי");
    expect(html).toContain("התחברות עם Google");
    expect(html).toContain("אפשר גם להירשם עם אימייל");
    expect(html).toContain('dir="ltr"');
  });

  it("renders localized callback errors", async () => {
    const Page = (await import("../../src/app/register/page")).default;
    const element = await Page({
      searchParams: Promise.resolve({ claim: "claim-token", error: "already_claimed" }),
    });
    const html = renderToString(element);

    expect(html).toContain("הקישור הזה כבר חובר לחשבון אחר");
  });
});
