import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentStatus } from "../../src/domain/payments/types";

type PaymentRow = {
  id: string;
  quiz_session_id: string;
  provider: string;
  provider_reference: string;
  status: PaymentStatus;
  amount_minor: number;
  currency: string;
  raw_payload: Record<string, unknown>;
  created_at: string;
};

type QuizSessionRow = {
  id: string;
  status: string;
};

const payments: PaymentRow[] = [];
const quizSessions: QuizSessionRow[] = [];
const auditLogs: Record<string, unknown>[] = [];
const revalidatedPaths: string[] = [];
const getChargesByCustomer = vi.fn();
const createPayment = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatedPaths.push(path),
}));

vi.mock("@/app/admin/actions/guard", () => ({
  requireAdminActionActor: async () => ({ userId: "admin-1", role: "admin" }),
}));

vi.mock("@/domain/payments/ching-adapter", async () => {
  const actual = await vi.importActual<typeof import("../../src/domain/payments/ching-adapter")>(
    "../../src/domain/payments/ching-adapter",
  );

  return {
    ...actual,
    createChingAdapter: () => ({
      getChargesByCustomer,
      createPayment,
    }),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: () => createFakeSupabase(),
}));

describe("admin payment recovery actions", () => {
  beforeEach(() => {
    vi.resetModules();
    payments.length = 0;
    quizSessions.length = 0;
    auditLogs.length = 0;
    revalidatedPaths.length = 0;
    getChargesByCustomer.mockReset();
    createPayment.mockReset();
    createPayment.mockImplementation(async (input: { paymentId: string }) => ({
      providerReference: `co_${input.paymentId}`,
      redirectUrl: `https://secured.ching.co.il/pay/${input.paymentId}`,
      customerId: `cus_${input.paymentId}`,
      checkoutRequest: { customer: `cus_${input.paymentId}` },
      checkoutResponse: { success: true, data: { id: `co_${input.paymentId}` } },
    }));
  });

  it("marks a pending payment failed, reopens the quiz session, and writes audit metadata", async () => {
    payments.push(paymentFixture({ status: "pending" }));
    quizSessions.push({ id: "session-1", status: "payment_pending" });
    const { markPaymentFailedAction } = await import("../../src/app/admin/actions/payments");

    await markPaymentFailedAction(form({ paymentId: "payment-1", reason: "Customer abandoned checkout" }));

    expect(payments[0].status).toBe("failed");
    expect(quizSessions[0].status).toBe("completed");
    expect(payments[0].raw_payload.recoveryActions).toEqual([
      expect.objectContaining({
        action: "payment.mark_failed",
        actorUserId: "admin-1",
        paymentId: "payment-1",
        oldStatus: "pending",
        newStatus: "failed",
        reason: "Customer abandoned checkout",
      }),
    ]);
    expect(auditLogs[0]).toMatchObject({
      actor_user_id: "admin-1",
      action: "payment.mark_failed",
      target_table: "payments",
      target_id: "payment-1",
      metadata: {
        paymentId: "payment-1",
        oldStatus: "pending",
        newStatus: "failed",
        reason: "Customer abandoned checkout",
      },
    });
    expect(revalidatedPaths).toEqual(["/admin/payments"]);
  });

  it("marks a failed payment cancelled and keeps paid payments protected", async () => {
    payments.push(paymentFixture({ status: "failed" }));
    quizSessions.push({ id: "session-1", status: "payment_pending" });
    const { markPaymentCancelledAction } = await import("../../src/app/admin/actions/payments");

    await markPaymentCancelledAction(form({ paymentId: "payment-1", reason: "Admin confirmed abandoned flow" }));
    expect(payments[0].status).toBe("cancelled");
    expect(quizSessions[0].status).toBe("completed");

    payments[0].status = "paid";
    await expect(
      markPaymentCancelledAction(form({ paymentId: "payment-1", reason: "Should not work" })),
    ).rejects.toThrow("Paid payments cannot be recovered");
  });

  it("appends provider reconciliation responses without marking paid from reconciliation alone", async () => {
    payments.push(
      paymentFixture({
        status: "pending",
        raw_payload: { customerId: "cus_1" },
      }),
    );
    getChargesByCustomer.mockResolvedValue({
      success: true,
      data: [{ id: "ch_1", status: "succeeded" }],
    });
    const { reconcilePaymentAction } = await import("../../src/app/admin/actions/payments");

    await reconcilePaymentAction(form({ paymentId: "payment-1" }));

    expect(getChargesByCustomer).toHaveBeenCalledWith("cus_1");
    expect(payments[0].status).toBe("pending");
    expect(payments[0].raw_payload.reconciliationPayloads).toEqual([
      expect.objectContaining({
        customerId: "cus_1",
        response: {
          success: true,
          data: [{ id: "ch_1", status: "succeeded" }],
        },
      }),
    ]);
    expect(auditLogs[0]).toMatchObject({
      action: "payment.reconcile",
      target_table: "payments",
      target_id: "payment-1",
    });
  });

  it("infers a cancelled status from CHING reconciliation responses", async () => {
    payments.push(
      paymentFixture({
        status: "pending",
        quiz_session_id: "session-1",
        raw_payload: { customerId: "cus_1" },
      }),
    );
    quizSessions.push({ id: "session-1", status: "payment_pending" });
    getChargesByCustomer.mockResolvedValue({
      success: true,
      data: [{ id: "ch_1", status: "canceled" }],
    });
    const { reconcilePaymentAction } = await import("../../src/app/admin/actions/payments");

    await reconcilePaymentAction(form({ paymentId: "payment-1" }));

    expect(getChargesByCustomer).toHaveBeenCalledWith("cus_1");
    expect(payments[0].status).toBe("cancelled");
    expect(quizSessions[0].status).toBe("completed");
  });

  it("creates exactly one active replacement checkout for a cancelled payment", async () => {
    payments.push(paymentFixture({ status: "cancelled" }));
    quizSessions.push({ id: "session-1", status: "completed" });
    const { createReplacementCheckoutAction } = await import("../../src/app/admin/actions/payments");

    const first = await createReplacementCheckoutAction(form({ paymentId: "payment-1" }));
    const second = await createReplacementCheckoutAction(form({ paymentId: "payment-1" }));

    const replacements = payments.filter((payment) => payment.raw_payload.replacementForPaymentId === "payment-1");
    expect(replacements).toHaveLength(1);
    expect(first).toEqual({
      paymentId: replacements[0].id,
      redirectUrl: replacements[0].raw_payload.redirectUrl,
      reused: false,
    });
    expect(second).toEqual({
      paymentId: replacements[0].id,
      redirectUrl: replacements[0].raw_payload.redirectUrl,
      reused: true,
    });
    expect(replacements[0]).toMatchObject({
      quiz_session_id: "session-1",
      status: "pending",
      amount_minor: 9900,
      currency: "ILS",
    });
    expect(replacements[0].raw_payload).toMatchObject({
      replacementForPaymentId: "payment-1",
      redirectUrl: expect.stringContaining(replacements[0].id),
      customerId: `cus_${replacements[0].id}`,
      checkoutRequest: { customer: `cus_${replacements[0].id}` },
      checkoutResponse: { success: true, data: { id: `co_${replacements[0].id}` } },
    });
    expect(payments[0].raw_payload.replacedByPaymentId).toBe(replacements[0].id);
    expect(quizSessions[0].status).toBe("payment_pending");
  });

  it("rejects replacement checkout creation for active or paid payments", async () => {
    payments.push(paymentFixture({ status: "pending" }));
    const { createReplacementCheckoutAction } = await import("../../src/app/admin/actions/payments");

    await expect(createReplacementCheckoutAction(form({ paymentId: "payment-1" }))).rejects.toThrow(
      "Only failed or cancelled payments can be replaced",
    );

    payments[0].status = "paid";
    await expect(createReplacementCheckoutAction(form({ paymentId: "payment-1" }))).rejects.toThrow(
      "Paid payments cannot be recovered",
    );
  });
});

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

function paymentFixture(input: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: "payment-1",
    quiz_session_id: "session-1",
    provider: "ching",
    provider_reference: "payment-1",
    status: "pending",
    amount_minor: 9900,
    currency: "ILS",
    raw_payload: {},
    created_at: "2026-06-02T00:00:00.000Z",
    ...input,
  };
}

function createFakeSupabase() {
  return {
    from(table: string) {
      if (table === "payments") {
        return createPaymentsTable();
      }
      if (table === "quiz_sessions") {
        return createQuizSessionsTable();
      }
      if (table === "admin_audit_logs") {
        return {
          insert: async (row: Record<string, unknown>) => {
            auditLogs.push(row);
            return { error: null };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

function createPaymentsTable() {
  return {
    select() {
      return createPaymentsQuery(payments);
    },
    insert(row: Partial<PaymentRow>) {
      const payment: PaymentRow = {
        id: `payment-${payments.length + 1}`,
        quiz_session_id: String(row.quiz_session_id),
        provider: String(row.provider ?? "ching"),
        provider_reference: String(row.provider_reference),
        status: (row.status as PaymentStatus) ?? "created",
        amount_minor: Number(row.amount_minor),
        currency: String(row.currency ?? "ILS"),
        raw_payload: (row.raw_payload as Record<string, unknown>) ?? {},
        created_at: "2026-06-02T00:00:00.000Z",
      };
      payments.push(payment);

      return {
        select() {
          return {
            single: async () => ({
              data: { id: payment.id, provider_reference: payment.provider_reference },
              error: null,
            }),
          };
        },
      };
    },
    update(update: Partial<PaymentRow>) {
      return {
        eq: async (column: string, value: string) => {
          if (column !== "id") {
            throw new Error(`Unsupported payment update eq ${column}`);
          }
          const payment = payments.find((row) => row.id === value);
          if (payment) {
            Object.assign(payment, update);
          }
          return { error: null };
        },
      };
    },
  };
}

function createPaymentsQuery(rows: PaymentRow[]) {
  let result = [...rows];

  const query = {
    eq(column: string, value: string) {
      result = result.filter((row) => readPaymentColumn(row, column) === value);
      return query;
    },
    in(column: string, values: string[]) {
      result = result.filter((row) => values.includes(String(readPaymentColumn(row, column))));
      return query;
    },
    order() {
      return query;
    },
    limit(count: number) {
      result = result.slice(0, count);
      return query;
    },
    maybeSingle: async () => ({ data: result[0] ?? null, error: null }),
    then(resolve: (value: { data: PaymentRow[]; error: null }) => unknown) {
      return Promise.resolve({ data: result, error: null }).then(resolve);
    },
  };

  return query;
}

function readPaymentColumn(row: PaymentRow, column: string) {
  if (column === "raw_payload->>replacementForPaymentId") {
    return row.raw_payload.replacementForPaymentId;
  }

  return row[column as keyof PaymentRow];
}

function createQuizSessionsTable() {
  return {
    update(update: Partial<QuizSessionRow>) {
      return {
        eq: async (column: string, value: string) => {
          if (column !== "id") {
            throw new Error(`Unsupported quiz session update eq ${column}`);
          }
          const session = quizSessions.find((row) => row.id === value);
          if (session) {
            Object.assign(session, update);
          }
          return { error: null };
        },
      };
    },
  };
}
