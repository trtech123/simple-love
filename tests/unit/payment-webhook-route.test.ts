import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const WEBHOOK_SECRET = "whsec_test";

const finalizePaymentById = vi.fn();
let fakePayment: {
  id: string;
  provider_reference: string;
  status: string;
  amount_minor: number;
  currency: string;
  raw_payload: Record<string, unknown>;
};
const updates: Record<string, unknown>[] = [];

vi.mock("@/app/api/payments/finalize", () => ({
  finalizePaymentById: (...args: unknown[]) => finalizePaymentById(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: () => ({
    from(table: string) {
      if (table !== "payments") {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: fakePayment, error: null }),
              };
            },
          };
        },
        update(input: Record<string, unknown>) {
          updates.push(input);
          return {
            eq: async () => ({ error: null }),
          };
        },
      };
    },
  }),
}));

function signedRequest(body: unknown, options: { signature?: string; query?: string } = {}) {
  const rawBody = JSON.stringify(body);
  const signature = options.signature ?? createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
  return new Request(`https://lovlov.me/api/payments/ching/webhook${options.query ?? ""}`, {
    method: "POST",
    headers: { "Ching-Signature": signature },
    body: rawBody,
  });
}

function chargeSucceeded(overrides: Record<string, unknown> = {}) {
  return {
    type: "charge.succeeded",
    data: {
      id: "ch_1",
      amount: 9900,
      currency: "ILS",
      metadata: { paymentId: "payment-1" },
      ...overrides,
    },
  };
}

describe("CHING webhook route", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.CHING_WEBHOOK_SECRET = WEBHOOK_SECRET;
    finalizePaymentById.mockReset();
    finalizePaymentById.mockResolvedValue({ status: "paid" });
    updates.length = 0;
    fakePayment = {
      id: "payment-1",
      provider_reference: "co_session_1",
      status: "pending",
      amount_minor: 9900,
      currency: "ILS",
      raw_payload: { customerId: "cus_123" },
    };
  });

  it("marks a valid charge.succeeded event paid and stores raw webhook metadata", async () => {
    const { POST } = await import("../../src/app/api/payments/ching/webhook/route");
    const event = chargeSucceeded();
    const response = await POST(signedRequest(event));

    expect(response.status).toBe(200);
    expect(finalizePaymentById).toHaveBeenCalledWith("payment-1", {
      type: "paid",
      providerReference: "co_session_1",
      amountMinor: 9900,
      currency: "ILS",
    });
    expect(updates[0]).toMatchObject({
      provider_reference: "ch_1",
      raw_payload: {
        customerId: "cus_123",
        providerTransactionId: "ch_1",
        webhookPayloads: [event],
      },
    });
  });

  it("resolves the payment from the URL query when metadata is absent", async () => {
    const { POST } = await import("../../src/app/api/payments/ching/webhook/route");
    const event = chargeSucceeded({ metadata: {} });
    const response = await POST(signedRequest(event, { query: "?payment=payment-1" }));

    expect(response.status).toBe(200);
    expect(finalizePaymentById).toHaveBeenCalledWith("payment-1", {
      type: "paid",
      providerReference: "co_session_1",
      amountMinor: 9900,
      currency: "ILS",
    });
  });

  it("preserves claim tokens stored by finalization when appending webhook metadata", async () => {
    finalizePaymentById.mockImplementation(async () => {
      fakePayment.raw_payload = { ...fakePayment.raw_payload, claimToken: "claim-token" };
      return { status: "paid", claimToken: "claim-token" };
    });
    const { POST } = await import("../../src/app/api/payments/ching/webhook/route");

    const response = await POST(signedRequest(chargeSucceeded()));

    expect(response.status).toBe(200);
    expect(updates[0]).toMatchObject({
      raw_payload: expect.objectContaining({
        claimToken: "claim-token",
        providerTransactionId: "ch_1",
      }),
    });
  });

  it("rejects events with an invalid signature before finalizing", async () => {
    const { POST } = await import("../../src/app/api/payments/ching/webhook/route");
    const response = await POST(signedRequest(chargeSucceeded(), { signature: "00" }));

    expect(response.status).toBe(400);
    expect(finalizePaymentById).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it("rejects amount mismatches before finalizing", async () => {
    const { POST } = await import("../../src/app/api/payments/ching/webhook/route");
    const response = await POST(signedRequest(chargeSucceeded({ amount: 100 })));

    expect(response.status).toBe(400);
    expect(finalizePaymentById).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it("ignores unrelated event types", async () => {
    const { POST } = await import("../../src/app/api/payments/ching/webhook/route");
    const response = await POST(signedRequest({ type: "customer.updated", data: {} }));

    expect(response.status).toBe(200);
    expect(finalizePaymentById).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it("records a failed charge event", async () => {
    finalizePaymentById.mockResolvedValue({ status: "failed" });
    const { POST } = await import("../../src/app/api/payments/ching/webhook/route");
    const event = {
      type: "charge.failed",
      data: { id: "ch_1", metadata: { paymentId: "payment-1" }, failure_reason: "card_declined" },
    };
    const response = await POST(signedRequest(event));

    expect(response.status).toBe(200);
    expect(finalizePaymentById).toHaveBeenCalledWith("payment-1", {
      type: "failed",
      providerReference: "co_session_1",
      reason: "card_declined",
    });
  });
});
