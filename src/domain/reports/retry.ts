import { buildAuditLog } from "@/domain/admin/audit";

export type ReportRetryMode = "original" | "latest";

export function canRetryReport(input: { status: "pending" | "generating" | "completed" | "failed" }) {
  return input.status === "failed";
}

export function selectRetryPromptVersion(input: {
  mode: ReportRetryMode;
  originalPromptVersionId: string;
  latestPromptVersionId: string;
}) {
  return input.mode === "latest" ? input.latestPromptVersionId : input.originalPromptVersionId;
}

export function buildReportRetryAuditLog(input: {
  actorUserId: string;
  reportId: string;
  mode: ReportRetryMode;
  promptVersionId: string;
}) {
  return buildAuditLog({
    actorUserId: input.actorUserId,
    action: "report.retry",
    targetTable: "reports",
    targetId: input.reportId,
    metadata: {
      mode: input.mode,
      promptVersionId: input.promptVersionId,
    },
  });
}
