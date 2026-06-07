import { describe, expect, it } from "vitest";
import {
  buildReportRetryAuditLog,
  canRetryReport,
  selectRetryPromptVersion,
} from "../../src/domain/reports/retry";

describe("report retry", () => {
  it("allows only failed reports to be retried", () => {
    expect(canRetryReport({ status: "failed" })).toBe(true);
    expect(canRetryReport({ status: "completed" })).toBe(false);
    expect(canRetryReport({ status: "generating" })).toBe(false);
  });

  it("uses the original prompt version by default and latest only when explicit", () => {
    expect(
      selectRetryPromptVersion({
        mode: "original",
        originalPromptVersionId: "prompt-original",
        latestPromptVersionId: "prompt-latest",
      }),
    ).toBe("prompt-original");

    expect(
      selectRetryPromptVersion({
        mode: "latest",
        originalPromptVersionId: "prompt-original",
        latestPromptVersionId: "prompt-latest",
      }),
    ).toBe("prompt-latest");
  });

  it("builds an audited admin retry event", () => {
    expect(
      buildReportRetryAuditLog({
        actorUserId: "admin-1",
        reportId: "report-1",
        mode: "original",
        promptVersionId: "prompt-original",
      }),
    ).toEqual({
      actor_user_id: "admin-1",
      action: "report.retry",
      target_table: "reports",
      target_id: "report-1",
      metadata: {
        mode: "original",
        promptVersionId: "prompt-original",
      },
    });
  });
});
