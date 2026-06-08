import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  setCookie: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      getAll: () => [{ name: "sb-token", value: "token" }],
      set: captured.setCookie,
    }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: captured.createServerClient,
}));

describe("server Supabase client", () => {
  beforeEach(() => {
    vi.resetModules();
    captured.createServerClient.mockReset();
    captured.setCookie.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("ignores cookie writes when rendering in a read-only Server Component context", async () => {
    captured.createServerClient.mockImplementation((_url, _key, options) => options);
    captured.setCookie.mockImplementation(() => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler.");
    });
    const { createClient } = await import("../../src/lib/supabase/server");

    const clientOptions = (await createClient()) as unknown as {
      cookies: {
        setAll: (cookiesToSet: { name: string; value: string; options?: { path?: string } }[]) => void;
      };
    };

    expect(() =>
      clientOptions.cookies.setAll([{ name: "sb-token", value: "next-token", options: { path: "/" } }]),
    ).not.toThrow();
    expect(captured.setCookie).toHaveBeenCalledOnce();
  });
});
