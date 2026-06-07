import {
  ClaimRegistrationError,
  claimReportForUser,
  validateClaimForAuthenticatedUser,
} from "@/domain/claims/claim-registration";
import {
  createSupabaseClaimRegistrationRepository,
  displayNameFromAuthUser,
  ensureProfileForUser,
} from "@/domain/claims/supabase-claim-registration";
import { DEFAULT_CLAIM_NEXT, DEFAULT_LOGIN_NEXT, normalizeNextPath } from "@/app/auth/next-path";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const claimToken = url.searchParams.get("claim")?.trim() ?? "";
  const code = url.searchParams.get("code")?.trim() ?? "";
  const nextPath = normalizeNextPath(
    url.searchParams.get("next"),
    claimToken ? DEFAULT_CLAIM_NEXT : DEFAULT_LOGIN_NEXT,
  );

  if (claimToken && !code) {
    return redirectToRegister(url, claimToken, "missing_code");
  }

  if (!claimToken && !code) {
    return redirectToLogin(url, nextPath, "missing_code");
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return claimToken ? redirectToRegister(url, claimToken, "auth_failed") : redirectToLogin(url, nextPath, "auth_failed");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return claimToken ? redirectToRegister(url, claimToken, "auth_failed") : redirectToLogin(url, nextPath, "auth_failed");
  }

  const serviceSupabase = createServiceRoleClient();

  if (!claimToken) {
    try {
      await ensureProfileForUser(serviceSupabase, {
        userId: user.id,
        displayName: displayNameFromAuthUser({
          id: user.id,
          email: user.email,
          user_metadata: user.user_metadata,
        }),
        now: new Date(),
      });
    } catch {
      return redirectToLogin(url, nextPath, "auth_failed");
    }

    return NextResponse.redirect(new URL(nextPath, url.origin));
  }

  const repository = createSupabaseClaimRegistrationRepository(serviceSupabase);
  const now = new Date();

  try {
    await validateClaimForAuthenticatedUser(repository, {
      claimToken,
      userId: user.id,
      now,
    });

    await ensureProfileForUser(serviceSupabase, {
      userId: user.id,
      displayName: displayNameFromAuthUser({
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata,
      }),
      now,
    });

    await claimReportForUser(repository, {
      claimToken,
      userId: user.id,
      now,
    });
  } catch (error) {
    if (error instanceof ClaimRegistrationError) {
      return redirectToRegister(url, claimToken, errorKeyForClaim(error));
    }

    return redirectToRegister(url, claimToken, "claim_failed");
  }

  return NextResponse.redirect(new URL(nextPath, url.origin));
}

function redirectToRegister(url: URL, claimToken: string, error: string) {
  const redirectUrl = new URL("/register", url.origin);

  if (claimToken) {
    redirectUrl.searchParams.set("claim", claimToken);
  }

  redirectUrl.searchParams.set("error", error);
  return NextResponse.redirect(redirectUrl);
}

function redirectToLogin(url: URL, nextPath: string, error: string) {
  const redirectUrl = new URL("/login", url.origin);
  redirectUrl.searchParams.set("next", nextPath);
  redirectUrl.searchParams.set("error", error);
  return NextResponse.redirect(redirectUrl);
}

function errorKeyForClaim(error: ClaimRegistrationError) {
  if (error.code === "expired") {
    return "expired_claim";
  }

  if (error.code === "already_claimed") {
    return "already_claimed";
  }

  return "invalid_claim";
}
