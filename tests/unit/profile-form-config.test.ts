import { describe, expect, it } from "vitest";

import {
  DEFAULT_PROFILE_FORM_CONFIG,
  parseProfileFormConfig,
  projectPublicProfileFormConfig,
} from "../../src/domain/matching/profile-form-config";

describe("profile form config", () => {
  it("accepts the default Hebrew RTL config", () => {
    const parsed = parseProfileFormConfig(DEFAULT_PROFILE_FORM_CONFIG);

    expect(parsed.direction).toBe("rtl");
    expect(parsed.genderOptions.map((option) => option.label)).toContain("אישה");
    expect(parsed.preferredDistanceKm.default).toBeGreaterThanOrEqual(parsed.preferredDistanceKm.min);
  });

  it("rejects duplicate option values within a config group", () => {
    expect(() =>
      parseProfileFormConfig({
        ...DEFAULT_PROFILE_FORM_CONFIG,
        genderOptions: [
          { value: "woman", label: "אישה" },
          { value: "woman", label: "כפילות" },
        ],
      }),
    ).toThrow("Duplicate option value");
  });

  it("projects only public config fields", () => {
    const storedVersion = {
      id: "version-1",
      version: 3,
      config: DEFAULT_PROFILE_FORM_CONFIG,
      status: "published",
      internalNotes: "hidden",
    };

    expect(
      projectPublicProfileFormConfig(storedVersion),
    ).toEqual({
      versionId: "version-1",
      version: 3,
      config: DEFAULT_PROFILE_FORM_CONFIG,
    });
  });
});
