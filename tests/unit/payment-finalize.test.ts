import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateReportOutput } from "../../src/domain/reports/report-output";
import type { PaymentStatus } from "../../src/domain/payments/types";

const mocks = vi.hoisted(() => ({
  generatePaidReport: vi.fn(),
}));

vi.mock("@/domain/reports/generation", async () => {
  const actual = await vi.importActual<typeof import("../../src/domain/reports/generation")>(
    "../../src/domain/reports/generation",
  );

  return {
    ...actual,
    generatePaidReport: (...args: unknown[]) => mocks.generatePaidReport(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: () => createFakeSupabase(),
}));

type PaymentRow = {
  id: string;
  quiz_session_id: string;
  provider_reference: string;
  status: PaymentStatus;
  amount_minor: number;
  currency: "ILS";
  raw_payload: Record<string, unknown>;
};

const state = {
  payment: {
    id: "payment-1",
    quiz_session_id: "session-1",
    user_id: null as string | null,
    product_key: "paid_report",
    provider_reference: "payment-1",
    status: "pending" as PaymentStatus,
    amount_minor: 9900,
    currency: "ILS" as const,
    raw_payload: {},
  },
  sessionUpdates: [] as string[],
  paymentUpdates: [] as Record<string, unknown>[],
  entitlements: [] as Record<string, unknown>[],
};

describe("finalizePaymentById", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mocks.generatePaidReport.mockReset();
    state.payment = {
      id: "payment-1",
      quiz_session_id: "session-1",
      user_id: null,
      product_key: "paid_report",
      provider_reference: "payment-1",
      status: "pending",
      amount_minor: 9900,
      currency: "ILS",
      raw_payload: {},
    };
    state.sessionUpdates = [];
    state.paymentUpdates = [];
    state.entitlements = [];
  });

  it("moves the quiz session through paid, report_generating, and report_ready on success", async () => {
    mocks.generatePaidReport.mockResolvedValue({ claimToken: "claim-token" });
    const { finalizePaymentById } = await import("../../src/app/api/payments/finalize");

    await expect(finalizePaymentById("payment-1")).resolves.toEqual({
      status: "paid",
      claimToken: "claim-token",
    });

    expect(state.sessionUpdates).toEqual(["paid", "report_generating", "report_ready"]);
    expect(state.paymentUpdates).toContainEqual(expect.objectContaining({ raw_payload: { claimToken: "claim-token" } }));
  });

  it("marks the quiz session report_failed when paid report generation fails", async () => {
    mocks.generatePaidReport.mockRejectedValue(new Error("report output invalid"));
    const { finalizePaymentById } = await import("../../src/app/api/payments/finalize");

    await expect(finalizePaymentById("payment-1")).resolves.toEqual({
      status: "paid",
      claimToken: null,
      reportStatus: "failed",
    });

    expect(state.sessionUpdates).toEqual(["paid", "report_generating", "report_failed"]);
  });

  it("grants matching entitlement for matching unlock payments without generating a report", async () => {
    state.payment = {
      ...state.payment,
      quiz_session_id: null as unknown as string,
      user_id: "user-1",
      product_key: "matching_unlock",
    };
    const { finalizePaymentById } = await import("../../src/app/api/payments/finalize");

    await expect(finalizePaymentById("payment-1")).resolves.toEqual({
      status: "paid",
      claimToken: null,
      matchingUnlocked: true,
    });

    expect(mocks.generatePaidReport).not.toHaveBeenCalled();
    expect(state.sessionUpdates).toEqual([]);
    expect(state.entitlements).toEqual([
      expect.objectContaining({
        user_id: "user-1",
        source_payment_id: "payment-1",
      }),
    ]);
  });

  it("uses the fixture report generator for placeholder OpenAI keys", async () => {
    vi.stubEnv("OPENAI_API_KEY", "placeholder-local-dev");
    const { createOpenAIReportGenerator } = await import("../../src/app/api/payments/finalize");

    const generateReport = createOpenAIReportGenerator();
    const output = await generateReport({ prompt: "prompt", model: "gpt-4o-mini", modelSettings: {} });

    expect(validateReportOutput(output)).toEqual(
      expect.objectContaining({
        title: "דוח עומק זוגי",
        openingSummary: expect.any(String),
        blockers: expect.arrayContaining([expect.any(String), expect.any(String), expect.any(String)]),
        relationshipNeeds: expect.arrayContaining([expect.any(String), expect.any(String), expect.any(String)]),
        sevenDayActionPlan: expect.any(Array),
      }),
    );
  });
});

function createFakeSupabase() {
  return {
    from(table: string) {
      if (table === "payments") {
        return createPaymentsTable();
      }
      if (table === "quiz_sessions") {
        return createQuizSessionsTable();
      }
      if (table === "reports") {
        return createReportsTable();
      }
      if (table === "matching_entitlements") {
        return createMatchingEntitlementsTable();
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

function createPaymentsTable() {
  return {
    select() {
      return {
        eq(_column: string, value: string) {
          return {
            maybeSingle: async () => ({
              data: value === state.payment.id ? state.payment : null,
              error: null,
            }),
          };
        },
      };
    },
    update(update: Record<string, unknown>) {
      state.paymentUpdates.push(update);
      if (typeof update.status === "string") {
        state.payment.status = update.status as PaymentStatus;
      }
      if (update.raw_payload && typeof update.raw_payload === "object") {
        state.payment.raw_payload = update.raw_payload as Record<string, unknown>;
      }

      return {
        eq: async () => ({ error: null }),
      };
    },
  };
}

function createQuizSessionsTable() {
  return {
    update(update: { status?: string }) {
      if (update.status) {
        state.sessionUpdates.push(update.status);
      }

      return {
        eq: async () => ({ error: null }),
      };
    },
  };
}

function createReportsTable() {
  return {
    select() {
      return {
        eq() {
          return this;
        },
        maybeSingle: async () => ({ data: null, error: null }),
      };
    },
  };
}

function createMatchingEntitlementsTable() {
  return {
    upsert(row: Record<string, unknown>) {
      state.entitlements.push(row);
      return {
        eq: async () => ({ error: null }),
      };
    },
  };
}
