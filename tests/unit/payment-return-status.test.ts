import { describe, expect, it } from "vitest";

describe("payment return status", () => {
  it("maps missing and pending payments to public return states", async () => {
    const { resolvePaymentReturnStatus } = await import("../../src/domain/payments/return-status");

    expect(await resolvePaymentReturnStatus(createRepository(), "missing-payment")).toEqual({ state: "not_found" });
    expect(
      await resolvePaymentReturnStatus(
        createRepository({
          payments: [{ id: "payment-1", quizSessionId: "session-1", status: "pending", rawPayload: {} }],
          sessions: [{ id: "session-1", publicToken: "public-token", status: "payment_pending" }],
        }),
        "payment-1",
      ),
    ).toEqual({ state: "payment_pending" });
  });

  it("returns retry quiz URLs for failed and cancelled payments", async () => {
    const { resolvePaymentReturnStatus } = await import("../../src/domain/payments/return-status");
    const repository = createRepository({
      payments: [
        { id: "failed-payment", quizSessionId: "session-1", status: "failed", rawPayload: {} },
        { id: "cancelled-payment", quizSessionId: "session-1", status: "cancelled", rawPayload: {} },
      ],
      sessions: [{ id: "session-1", publicToken: "public-token", status: "payment_pending" }],
    });

    await expect(resolvePaymentReturnStatus(repository, "failed-payment")).resolves.toEqual({
      state: "payment_failed",
      retryQuizUrl: "/quiz?session=public-token",
    });
    await expect(resolvePaymentReturnStatus(repository, "cancelled-payment")).resolves.toEqual({
      state: "payment_cancelled",
      retryQuizUrl: "/quiz?session=public-token",
    });
  });

  it("maps paid payments to generating, failed, or ready report states", async () => {
    const { resolvePaymentReturnStatus } = await import("../../src/domain/payments/return-status");

    await expect(
      resolvePaymentReturnStatus(
        createRepository({
          payments: [{ id: "payment-1", quizSessionId: "session-1", status: "paid", rawPayload: {} }],
          sessions: [{ id: "session-1", publicToken: "public-token", status: "report_generating" }],
          reports: [{ id: "report-1", quizSessionId: "session-1", status: "generating" }],
        }),
        "payment-1",
      ),
    ).resolves.toEqual({ state: "report_generating" });

    await expect(
      resolvePaymentReturnStatus(
        createRepository({
          payments: [{ id: "payment-1", quizSessionId: "session-1", status: "paid", rawPayload: {} }],
          sessions: [{ id: "session-1", publicToken: "public-token", status: "report_failed" }],
          reports: [{ id: "report-1", quizSessionId: "session-1", status: "failed" }],
        }),
        "payment-1",
      ),
    ).resolves.toEqual({ state: "report_failed" });

    await expect(
      resolvePaymentReturnStatus(
        createRepository({
          payments: [
            {
              id: "payment-1",
              quizSessionId: "session-1",
              status: "paid",
              rawPayload: { claimToken: "claim-token" },
            },
          ],
          sessions: [{ id: "session-1", publicToken: "public-token", status: "report_ready" }],
          reports: [{ id: "report-1", quizSessionId: "session-1", status: "completed" }],
        }),
        "payment-1",
      ),
    ).resolves.toEqual({ state: "report_ready", claimToken: "claim-token" });
  });
});

type PaymentStatus = "created" | "pending" | "paid" | "failed" | "cancelled";
type QuizStatus = "completed" | "payment_pending" | "paid" | "report_generating" | "report_ready" | "report_failed";
type ReportStatus = "pending" | "generating" | "completed" | "failed";

type RepositoryFixtures = {
  payments?: Array<{ id: string; quizSessionId: string; status: PaymentStatus; rawPayload: Record<string, unknown> }>;
  sessions?: Array<{ id: string; publicToken: string; status: QuizStatus }>;
  reports?: Array<{ id: string; quizSessionId: string; status: ReportStatus }>;
};

function createRepository(fixtures: RepositoryFixtures = {}) {
  const payments = fixtures.payments ?? [];
  const sessions = fixtures.sessions ?? [];
  const reports = fixtures.reports ?? [];

  return {
    async getPayment(paymentId: string) {
      return payments.find((payment) => payment.id === paymentId) ?? null;
    },
    async getQuizSession(sessionId: string) {
      return sessions.find((session) => session.id === sessionId) ?? null;
    },
    async getReportByQuizSession(sessionId: string) {
      return reports.find((report) => report.quizSessionId === sessionId) ?? null;
    },
  };
}
