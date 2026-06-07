import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminRestState, createFakeAdminSupabase, jsonRequest } from "./admin-rest-fake-supabase";

const state = createAdminRestState();

vi.mock("@/domain/payments/ching-adapter", () => ({
  createChingAdapter: () => ({
    getChargesByCustomer: async () => ({ success: true, data: [{ status: "canceled" }] }),
    createPayment: async (input: { paymentId: string }) => ({
      providerReference: `co_${input.paymentId}`,
      redirectUrl: `https://pay.example/${input.paymentId}`,
      customerId: `cus_${input.paymentId}`,
      checkoutRequest: {},
      checkoutResponse: { success: true },
    }),
  }),
}));

describe("/api/admin/payments and /api/admin/reports", () => {
  beforeEach(() => {
    vi.resetModules();
    state.user = { id: "admin-1", app_metadata: { role: "admin" } };
    state.tables = {
      admin_audit_logs: [],
      payments: [
        {
          id: "payment-1",
          quiz_session_id: "session-1",
          user_id: null,
          product_key: "paid_report",
          provider: "ching",
          provider_reference: "payment-1",
          status: "pending",
          amount_minor: 9900,
          currency: "ILS",
          raw_payload: { customerId: "cus_1" },
          created_at: "2026-06-06T09:00:00.000Z",
        },
      ],
      quiz_sessions: [{ id: "session-1", status: "payment_pending" }],
      reports: [
        {
          id: "report-1",
          quiz_session_id: "session-1",
          report_number: "R-1",
          status: "failed",
          error_message: "bad",
          prompt_version_id: "prompt-1",
          archetype_version_id: null,
          input_snapshot: { answers: [] },
          created_at: "2026-06-06T09:00:00.000Z",
        },
      ],
      prompt_versions: [
        {
          id: "prompt-1",
          slug: "paid-report-v1",
          status: "published",
          version: 1,
          template: "{{displayName}} {{answersJson}} {{archetypeName}}",
          model: "gpt-4.1-mini",
          model_settings: {},
        },
      ],
      registration_claim_tokens: [],
    };
    state.tableErrors = {};
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user }, error: null }) } }),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createServiceRoleClient: () => createFakeAdminSupabase(state),
    }));
  });

  it("lists payments for admins and rejects unauthenticated report access", async () => {
    const { GET: payments } = await import("../../src/app/api/admin/payments/route");
    const paymentsResponse = await payments();
    expect(paymentsResponse.status).toBe(200);
    await expect(paymentsResponse.json()).resolves.toMatchObject({
      ok: true,
      data: { payments: [{ id: "payment-1" }] },
    });

    state.user = null;
    const { GET: reports } = await import("../../src/app/api/admin/reports/route");
    const reportsResponse = await reports();
    expect(reportsResponse.status).toBe(401);
  });

  it("marks payments failed with validation and audit", async () => {
    const { POST } = await import("../../src/app/api/admin/payments/[paymentId]/mark-failed/route");

    const invalid = await POST(jsonRequest("http://localhost/api/admin/payments/payment-1/mark-failed", "POST"), {
      params: Promise.resolve({ paymentId: "payment-1" }),
    });
    expect(invalid.status).toBe(400);

    const response = await POST(
      jsonRequest("http://localhost/api/admin/payments/payment-1/mark-failed", "POST", { reason: "נטישה" }),
      { params: Promise.resolve({ paymentId: "payment-1" }) },
    );

    expect(response.status).toBe(200);
    expect(state.tables.payments[0].status).toBe("failed");
    expect(state.tables.admin_audit_logs).toContainEqual(
      expect.objectContaining({ action: "payment.mark_failed", target_id: "payment-1" }),
    );
  });

  it("retries failed reports and writes audit", async () => {
    const { POST } = await import("../../src/app/api/admin/reports/[reportId]/retry/route");

    const response = await POST(
      jsonRequest("http://localhost/api/admin/reports/report-1/retry", "POST", { mode: "original" }),
      { params: Promise.resolve({ reportId: "report-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, data: { reportId: "report-1" } });
    expect(state.tables.admin_audit_logs).toContainEqual(
      expect.objectContaining({ action: "report.retry", target_id: "report-1" }),
    );
  });
});
