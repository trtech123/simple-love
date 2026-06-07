import { NextResponse } from "next/server";
import { getReportByClaimToken } from "@/domain/reports/claim-lookup";
import { createReportPdfBytes, createReportPdfStoragePath } from "@/domain/reports/pdf";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const REPORT_PDF_BUCKET = "report-pdfs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ claimToken: string }> },
) {
  const { claimToken } = await context.params;
  const report = await getReportByClaimToken(claimToken);

  if (!report) {
    return NextResponse.json({ error: "Report was not found" }, { status: 404 });
  }

  const pdf = createReportPdfBytes({
    reportNumber: report.reportNumber,
    ...report.output,
  });
  await persistReportPdfArtifact({
    reportId: report.reportId,
    reportNumber: report.reportNumber,
    pdf,
  });

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${report.reportNumber}.pdf"`,
    },
  });
}

async function persistReportPdfArtifact(input: {
  reportId: string;
  reportNumber: string;
  pdf: Uint8Array;
}) {
  const supabase = createServiceRoleClient();
  const storagePath = createReportPdfStoragePath(input.reportId, input.reportNumber);
  const { error: uploadError } = await supabase.storage
    .from(REPORT_PDF_BUCKET)
    .upload(storagePath, input.pdf, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    return;
  }

  await supabase.from("report_artifacts").upsert(
    {
      report_id: input.reportId,
      artifact_type: "pdf",
      storage_bucket: REPORT_PDF_BUCKET,
      storage_path: storagePath,
      content_type: "application/pdf",
    },
    { onConflict: "report_id,artifact_type" },
  );
}
