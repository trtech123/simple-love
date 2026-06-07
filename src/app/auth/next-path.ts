export const DEFAULT_LOGIN_NEXT = "/matches";
export const DEFAULT_CLAIM_NEXT = "/profile/matching";

export function normalizeNextPath(next: string | null | undefined, fallback = DEFAULT_LOGIN_NEXT) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return fallback;
  }

  return next;
}
