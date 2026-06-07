import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const guardMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: guardMocks.getUser,
    },
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: guardMocks.notFound,
}));

describe("admin page guard", () => {
  beforeEach(() => {
    guardMocks.getUser.mockReset();
    guardMocks.notFound.mockClear();
  });

  it("allows admin users through", async () => {
    guardMocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "admin-1",
          app_metadata: { role: "admin" },
        },
      },
      error: null,
    });

    const { requireAdminPageAccess } = await import("../../src/app/admin/guard");

    await expect(requireAdminPageAccess()).resolves.toEqual({ userId: "admin-1", role: "admin" });
    expect(guardMocks.notFound).not.toHaveBeenCalled();
  });

  it("denies unauthenticated users", async () => {
    guardMocks.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const { requireAdminPageAccess } = await import("../../src/app/admin/guard");

    await expect(requireAdminPageAccess()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(guardMocks.notFound).toHaveBeenCalledTimes(1);
  });

  it("denies non-admin users", async () => {
    guardMocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          app_metadata: { role: "user" },
        },
      },
      error: null,
    });

    const { requireAdminPageAccess } = await import("../../src/app/admin/guard");

    await expect(requireAdminPageAccess()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(guardMocks.notFound).toHaveBeenCalledTimes(1);
  });

  it("is enforced by the admin layout", () => {
    const source = readFileSync("src/app/admin/layout.tsx", "utf8");

    expect(source).toContain("requireAdminPageAccess");
    expect(source).toMatch(/await\s+requireAdminPageAccess\(\)/);
  });
});
