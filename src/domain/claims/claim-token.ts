import { createHash, randomBytes } from "node:crypto";

export async function createClaimToken() {
  const rawToken = randomBytes(32).toString("base64url");
  return {
    rawToken,
    tokenHash: hashClaimToken(rawToken),
  };
}

export function hashClaimToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function canClaimToken(
  token: { expiresAt: Date; claimedAt: Date | null },
  now: Date,
): boolean {
  return token.claimedAt === null && token.expiresAt.getTime() > now.getTime();
}
