export const DEFAULT_LOGIN_NEXT = "/app";
export const DEFAULT_CLAIM_NEXT = "/app";

export function normalizeNextPath(next: string | null | undefined, fallback = DEFAULT_LOGIN_NEXT) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return fallback;
  }

  return next;
}
