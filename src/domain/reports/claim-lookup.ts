import { canClaimToken, hashClaimToken } from "@/domain/claims/claim-token";
import { reportOutputSchema } from "./report-output";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export async function getReportByClaimToken(claimToken: string) {
  const supabase = createServiceRoleClient();
  const tokenHash = hashClaimToken(claimToken);
  const { data: token, error } = await supabase
    .from("registration_claim_tokens")
    .select("report_id, expires_at, claimed_at")
    .eq("token_hash", tokenHash)
    .maybeSingle<{ report_id: string; expires_at: string; claimed_at: string | null }>();

  if (error) {
    throw new Error(error.message);
  }

  if (
    !token ||
    !canClaimToken(
      {
        expiresAt: new Date(token.expires_at),
        claimedAt: token.claimed_at ? new Date(token.claimed_at) : null,
      },
      new Date(),
    )
  ) {
    return null;
  }

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("id, report_number, output, status")
    .eq("id", token.report_id)
    .eq("status", "completed")
    .maybeSingle<{ id: string; report_number: string; output: unknown; status: string }>();

  if (reportError) {
    throw new Error(reportError.message);
  }

  if (!report) {
    return null;
  }

  return {
    reportId: report.id,
    reportNumber: report.report_number,
    output: reportOutputSchema.parse(report.output),
    canRegister: true,
  };
}
