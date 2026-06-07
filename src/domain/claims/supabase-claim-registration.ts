import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClaimRegistrationRepository } from "./claim-registration";

export function createSupabaseClaimRegistrationRepository(supabase: SupabaseClient): ClaimRegistrationRepository {
  return {
    async getClaimByTokenHash(tokenHash) {
      const { data: token, error } = await supabase
        .from("registration_claim_tokens")
        .select("id, quiz_session_id, report_id, expires_at, claimed_at, claimed_by")
        .eq("token_hash", tokenHash)
        .maybeSingle<{
          id: string;
          quiz_session_id: string;
          report_id: string;
          expires_at: string;
          claimed_at: string | null;
          claimed_by: string | null;
        }>();

      if (error) {
        throw new Error(error.message);
      }

      if (!token) {
        return null;
      }

      const { data: report, error: reportError } = await supabase
        .from("reports")
        .select("id, status")
        .eq("id", token.report_id)
        .maybeSingle<{ id: string; status: string }>();

      if (reportError) {
        throw new Error(reportError.message);
      }

      return {
        id: token.id,
        quizSessionId: token.quiz_session_id,
        reportId: token.report_id,
        expiresAt: new Date(token.expires_at),
        claimedAt: token.claimed_at ? new Date(token.claimed_at) : null,
        claimedBy: token.claimed_by,
        reportStatus: report?.status ?? "missing",
      };
    },
    async completeClaim(input) {
      const timestamp = input.claimedAt.toISOString();
      const { error: reportError } = await supabase
        .from("reports")
        .update({ user_id: input.userId, updated_at: timestamp })
        .eq("id", input.reportId);

      if (reportError) {
        throw new Error(reportError.message);
      }

      const { error: sessionError } = await supabase
        .from("quiz_sessions")
        .update({ user_id: input.userId, updated_at: timestamp })
        .eq("id", input.quizSessionId);

      if (sessionError) {
        throw new Error(sessionError.message);
      }

      const { error: claimError } = await supabase
        .from("registration_claim_tokens")
        .update({ claimed_by: input.userId, claimed_at: timestamp })
        .eq("id", input.claimId)
        .is("claimed_at", null);

      if (claimError) {
        throw new Error(claimError.message);
      }
    },
  };
}

export async function ensureProfileForUser(
  supabase: SupabaseClient,
  input: {
    userId: string;
    displayName: string;
    now: Date;
  },
) {
  const { data: existingProfile, error: profileLookupError } = await supabase
    .from("profiles")
    .select("user_id, display_name")
    .eq("user_id", input.userId)
    .maybeSingle<{ user_id: string; display_name: string }>();

  if (profileLookupError) {
    throw new Error(profileLookupError.message);
  }

  if (existingProfile) {
    return { created: false };
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    user_id: input.userId,
    display_name: input.displayName,
    updated_at: input.now.toISOString(),
  });

  if (profileError) {
    throw new Error(profileError.message);
  }

  return { created: true };
}

export function displayNameFromAuthUser(user: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}) {
  const metadata = user.user_metadata ?? {};
  const metadataName = [metadata.full_name, metadata.name, metadata.display_name].find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );

  if (metadataName) {
    return metadataName.trim().slice(0, 120);
  }

  const emailPrefix = user.email?.split("@")[0]?.trim();
  if (emailPrefix) {
    return emailPrefix.slice(0, 120);
  }

  return "משתמש lovlov";
}
