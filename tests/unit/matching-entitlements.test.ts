import { describe, expect, it } from "vitest";
import { resolveMatchesGate } from "../../src/domain/matching/entitlements";

describe("matching entitlements", () => {
  it("routes users through profile, depth questionnaire, payment, and unlocked matches in order", () => {
    expect(
      resolveMatchesGate({
        hasProfile: false,
        matchingProfileComplete: false,
        completedDepthQuestionnaireAt: null,
        hasMatchingEntitlement: false,
      }),
    ).toBe("profile_required");

    expect(
      resolveMatchesGate({
        hasProfile: true,
        matchingProfileComplete: true,
        completedDepthQuestionnaireAt: null,
        hasMatchingEntitlement: false,
      }),
    ).toBe("depth_questionnaire_required");

    expect(
      resolveMatchesGate({
        hasProfile: true,
        matchingProfileComplete: true,
        completedDepthQuestionnaireAt: "2026-06-06T00:00:00.000Z",
        hasMatchingEntitlement: false,
      }),
    ).toBe("payment_required");

    expect(
      resolveMatchesGate({
        hasProfile: true,
        matchingProfileComplete: true,
        completedDepthQuestionnaireAt: "2026-06-06T00:00:00.000Z",
        hasMatchingEntitlement: true,
      }),
    ).toBe("unlocked");
  });
});
