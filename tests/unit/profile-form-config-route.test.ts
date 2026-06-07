import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PROFILE_FORM_CONFIG } from "../../src/domain/matching/profile-form-config";

const state = {
  selectError: null as { message: string } | null,
  version: {
    id: "config-version-1",
    version: 1,
    status: "published",
    config: DEFAULT_PROFILE_FORM_CONFIG,
  } as Record<string, unknown> | null,
};

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: () => ({
    from(table: string) {
      expect(table).toBe("profile_form_config_versions");
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        async maybeSingle() {
          return { data: state.version, error: state.selectError };
        },
      };
    },
  }),
}));

describe("/api/profile/matching/config", () => {
  beforeEach(() => {
    vi.resetModules();
    state.selectError = null;
    state.version = {
      id: "config-version-1",
      version: 1,
      status: "published",
      config: DEFAULT_PROFILE_FORM_CONFIG,
    };
  });

  it("returns the published profile form config in a success envelope", async () => {
    const { GET } = await import("../../src/app/api/profile/matching/config/route");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        versionId: "config-version-1",
        version: 1,
        config: DEFAULT_PROFILE_FORM_CONFIG,
      },
    });
  });

  it("returns a development fallback when the config table is unavailable", async () => {
    state.selectError = { message: "relation profile_form_config_versions does not exist" };
    const { GET } = await import("../../src/app/api/profile/matching/config/route");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        versionId: "default-code",
        version: 1,
        config: DEFAULT_PROFILE_FORM_CONFIG,
      },
    });
  });

  it("returns 503 when the published config is invalid", async () => {
    state.version = {
      id: "bad-version",
      version: 2,
      status: "published",
      config: { ...DEFAULT_PROFILE_FORM_CONFIG, direction: "ltr" },
    };
    const { GET } = await import("../../src/app/api/profile/matching/config/route");

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "published_config_invalid",
      message: "הגדרת טופס הפרופיל שפורסמה אינה תקינה.",
    });
  });
});
