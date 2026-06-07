import { getReportByClaimToken } from "@/domain/reports/claim-lookup";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ claimToken: string }> },
) {
  const { claimToken } = await context.params;
  const data = await getReportByClaimToken(claimToken);

  if (!data) {
    return NextResponse.json({ error: "Report was not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
