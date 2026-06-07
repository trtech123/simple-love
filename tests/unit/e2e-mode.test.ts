import { describe, expect, it } from "vitest";
import { isE2eTestMode } from "../../src/lib/e2e-mode";

describe("isE2eTestMode", () => {
  it("is disabled by default", () => {
    expect(isE2eTestMode({})).toBe(false);
  });

  it("is enabled only when the E2E flag is set outside production", () => {
    expect(isE2eTestMode({ E2E_TEST_MODE: "1", NODE_ENV: "test" })).toBe(true);
    expect(isE2eTestMode({ E2E_TEST_MODE: "1", NODE_ENV: "production" })).toBe(false);
  });
});
