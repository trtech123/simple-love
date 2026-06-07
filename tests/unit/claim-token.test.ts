import { describe, expect, it } from "vitest";
import { canClaimToken, createClaimToken } from "../../src/domain/claims/claim-token";

describe("claim tokens", () => {
  it("creates a raw token and separate hash", async () => {
    const token = await createClaimToken();

    expect(token.rawToken.length).toBeGreaterThan(24);
    expect(token.tokenHash).not.toBe(token.rawToken);
  });

  it("rejects expired or already claimed tokens", () => {
    const now = new Date("2026-06-01T12:00:00Z");

    expect(canClaimToken({ expiresAt: new Date("2026-06-01T12:05:00Z"), claimedAt: null }, now)).toBe(true);
    expect(canClaimToken({ expiresAt: new Date("2026-06-01T11:59:00Z"), claimedAt: null }, now)).toBe(false);
    expect(canClaimToken({ expiresAt: new Date("2026-06-01T12:05:00Z"), claimedAt: now }, now)).toBe(false);
  });
});
