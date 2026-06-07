import { beforeEach, describe, expect, it, vi } from "vitest";

let cookieValue: string | undefined;
const getUser = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (name === "lovlov_e2e_user_id" && cookieValue ? { value: cookieValue } : undefined),
    }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser },
    }),
}));

describe("requireAuthenticatedUserId", () => {
  beforeEach(() => {
    vi.resetModules();
    cookieValue = "user-a";
    getUser.mockReset();
    delete process.env.E2E_TEST_MODE;
  });

  it("uses the e2e user cookie only in e2e mode", async () => {
    process.env.E2E_TEST_MODE = "1";
    const { requireAuthenticatedUserId } = await import("../../src/app/api/matching/auth");

    await expect(requireAuthenticatedUserId()).resolves.toBe("user-a");
    expect(getUser).not.toHaveBeenCalled();
  });

  it("falls back to Supabase auth when e2e mode is disabled", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "real-user" } }, error: null });
    const { requireAuthenticatedUserId } = await import("../../src/app/api/matching/auth");

    await expect(requireAuthenticatedUserId()).resolves.toBe("real-user");
    expect(getUser).toHaveBeenCalledOnce();
  });
});
