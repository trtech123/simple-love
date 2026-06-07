import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPaymentReturnStatus: vi.fn(),
  reconcileReturnedPayment: vi.fn(),
}));

vi.mock("@/domain/payments/return-status", () => ({
  getPaymentReturnStatus: (paymentId: string) => mocks.getPaymentReturnStatus(paymentId),
}));

vi.mock("@/app/api/payments/reconcile-return", () => ({
  reconcileReturnedPayment: (paymentId: string) => mocks.reconcileReturnedPayment(paymentId),
}));

describe("GET /api/payments/status", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getPaymentReturnStatus.mockReset();
    mocks.reconcileReturnedPayment.mockReset();
  });

  it("rejects missing payment ids", async () => {
    const { GET } = await import("../../src/app/api/payments/status/route");

    const response = await GET(new Request("http://localhost/api/payments/status"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "payment is required" });
  });

  it("returns the payment status JSON", async () => {
    mocks.getPaymentReturnStatus.mockResolvedValue({ state: "report_ready", claimToken: "claim-token" });
    const { GET } = await import("../../src/app/api/payments/status/route");

    const response = await GET(new Request("http://localhost/api/payments/status?payment=payment-1"));

    expect(response.status).toBe(200);
    expect(mocks.getPaymentReturnStatus).toHaveBeenCalledWith("payment-1");
    await expect(response.json()).resolves.toEqual({ state: "report_ready", claimToken: "claim-token" });
  });

  it("reconciles with the provider when a returned payment is still pending", async () => {
    mocks.getPaymentReturnStatus
      .mockResolvedValueOnce({ state: "payment_pending" })
      .mockResolvedValueOnce({ state: "report_ready", claimToken: "claim-token" });
    mocks.reconcileReturnedPayment.mockResolvedValue({ reconciled: true });
    const { GET } = await import("../../src/app/api/payments/status/route");

    const response = await GET(new Request("http://localhost/api/payments/status?payment=payment-1"));

    expect(mocks.reconcileReturnedPayment).toHaveBeenCalledWith("payment-1");
    expect(mocks.getPaymentReturnStatus).toHaveBeenCalledTimes(2);
    await expect(response.json()).resolves.toEqual({ state: "report_ready", claimToken: "claim-token" });
  });
});
