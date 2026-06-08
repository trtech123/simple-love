import { describe, expect, it } from "vitest";
import {
  createCheckout,
  createMatchingCheckout,
  applyPaymentEvent,
} from "../../src/domain/payments/payment-state";
import {
  MockChingAdapter,
  RealChingAdapter,
  verifyChingSignature,
} from "../../src/domain/payments/ching-adapter";
import { createHmac } from "node:crypto";

describe("applyPaymentEvent", () => {
  it("creates checkout records and moves completed sessions to payment_pending", async () => {
    const updates: string[] = [];
    const result = await createCheckout(
      {
        async getCompletedSessionByToken(publicToken) {
          return publicToken === "public-token" ? { id: "session-1", publicToken, status: "completed" } : null;
        },
        async createPayment(input) {
          return {
            id: "payment-1",
            providerReference: input.providerReference,
            redirectUrl: "https://pay.example/checkout",
          };
        },
        async markSessionPaymentPending(sessionId) {
          updates.push(sessionId);
        },
      },
      {
        sessionToken: "public-token",
        amountMinor: 9900,
        currency: "ILS",
        createProviderReference: () => "provider-ref",
        buildRedirectUrl: () => "https://pay.example/checkout",
      },
    );

    expect(result).toEqual({
      paymentId: "payment-1",
      redirectUrl: "https://pay.example/checkout",
    });
    expect(updates).toEqual(["session-1"]);
  });

  it("returns an existing active checkout redirect instead of creating a duplicate payment", async () => {
    const createdPayments: unknown[] = [];
    const updates: string[] = [];

    const result = await createCheckout(
      {
        async getCompletedSessionByToken(publicToken) {
          return publicToken === "public-token" ? { id: "session-1", publicToken, status: "payment_pending" } : null;
        },
        async getActivePaymentBySessionId(sessionId) {
          return sessionId === "session-1"
            ? { id: "payment-1", redirectUrl: "https://secured.ching.co.il/pay/existing" }
            : null;
        },
        async createPayment(input) {
          createdPayments.push(input);
          return {
            id: "payment-2",
            providerReference: input.providerReference,
            redirectUrl: "https://secured.ching.co.il/pay/new",
          };
        },
        async markSessionPaymentPending(sessionId) {
          updates.push(sessionId);
        },
      },
      {
        sessionToken: "public-token",
        amountMinor: 9900,
        currency: "ILS",
        createProviderReference: () => "provider-ref",
        buildRedirectUrl: () => "https://pay.example/checkout",
      },
    );

    expect(result).toEqual({
      paymentId: "payment-1",
      redirectUrl: "https://secured.ching.co.il/pay/existing",
    });
    expect(createdPayments).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("creates matching unlock checkout only after profile and depth questionnaire are complete", async () => {
    const createdPayments: unknown[] = [];
    const result = await createMatchingCheckout(
      {
        async getMatchingCheckoutUser(userId) {
          return userId === "user-1"
            ? {
                userId,
                matchingProfileComplete: true,
                completedDepthQuestionnaireAt: "2026-06-06T00:00:00.000Z",
                hasMatchingEntitlement: false,
              }
            : null;
        },
        async createPayment(input) {
          createdPayments.push(input);
          return {
            id: "payment-1",
            providerReference: input.providerReference,
            redirectUrl: "https://pay.example/matching",
          };
        },
      },
      {
        userId: "user-1",
        amountMinor: 9900,
        currency: "ILS",
        createProviderReference: () => "provider-ref",
        buildRedirectUrl: () => "https://pay.example/matching",
      },
    );

    expect(result).toEqual({ paymentId: "payment-1", redirectUrl: "https://pay.example/matching" });
    expect(createdPayments).toEqual([
      expect.objectContaining({
        userId: "user-1",
        productKey: "matching_unlock",
        amountMinor: 9900,
      }),
    ]);
  });

  it("rejects matching unlock checkout before the depth questionnaire is complete", async () => {
    await expect(
      createMatchingCheckout(
        {
          async getMatchingCheckoutUser() {
            return {
              userId: "user-1",
              matchingProfileComplete: true,
              completedDepthQuestionnaireAt: null,
              hasMatchingEntitlement: false,
            };
          },
          async createPayment() {
            throw new Error("should not create payment");
          },
        },
        {
          userId: "user-1",
          amountMinor: 9900,
          currency: "ILS",
          createProviderReference: () => "provider-ref",
          buildRedirectUrl: () => "https://pay.example/matching",
        },
      ),
    ).rejects.toThrow("Complete the depth questionnaire before unlocking matches");
  });

  it("marks payment paid only when amount and currency match", () => {
    const result = applyPaymentEvent(
      { status: "pending", amountMinor: 9900, currency: "ILS", providerReference: "abc" },
      { type: "paid", amountMinor: 9900, currency: "ILS", providerReference: "abc" },
    );

    expect(result.status).toBe("paid");
  });

  it("rejects mismatched amount", () => {
    expect(() =>
      applyPaymentEvent(
        { status: "pending", amountMinor: 9900, currency: "ILS", providerReference: "abc" },
        { type: "paid", amountMinor: 100, currency: "ILS", providerReference: "abc" },
      ),
    ).toThrow("Payment amount mismatch");
  });

  it("is idempotent for duplicate paid events", () => {
    const result = applyPaymentEvent(
      { status: "paid", amountMinor: 9900, currency: "ILS", providerReference: "abc" },
      { type: "paid", amountMinor: 9900, currency: "ILS", providerReference: "abc" },
    );

    expect(result.status).toBe("paid");
  });

  it("verifies CHING webhook signatures with HMAC-SHA256 over the raw body", () => {
    const rawBody = JSON.stringify({ type: "charge.succeeded" });
    const signature = createHmac("sha256", "whsec_test").update(rawBody).digest("hex");

    expect(verifyChingSignature(rawBody, signature, "whsec_test")).toBe(true);
    expect(verifyChingSignature(rawBody, signature, "whsec_other")).toBe(false);
    expect(verifyChingSignature("tampered", signature, "whsec_test")).toBe(false);
    expect(verifyChingSignature(rawBody, null, "whsec_test")).toBe(false);
  });

  it("routes local mock checkout directly to payment return without an intermediate page", async () => {
    const payment = await new MockChingAdapter().createPayment({
      paymentId: "payment-1",
      quizSessionId: "session-1",
      amountMinor: 9900,
      currency: "ILS",
      notifyUrl: "http://localhost:3000/api/payments/ching/webhook?payment=payment-1",
      successUrl: "http://localhost:3000/payment/return?payment=payment-1",
      failureUrl: "http://localhost:3000/payment/return?payment=payment-1&cancelled=1",
    });

    expect(payment.redirectUrl).toBe("http://localhost:3000/payment/return?payment=payment-1&mockPayment=paid");
  });

  it("upserts a CHING customer and builds a checkout session with agorot line items", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const adapter = new RealChingAdapter(
      {
        endpointUrl: "https://api.ching.co.il",
        apiKey: "ck_test_key",
      },
      async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        if (String(url).endsWith("/customers/upsert")) {
          return new Response(JSON.stringify({ success: true, data: { id: "cus_123" } }), { status: 200 });
        }
        return new Response(
          JSON.stringify({ success: true, data: { id: "co_abc", url: "https://secured.ching.co.il/co_abc" } }),
          { status: 200 },
        );
      },
    );

    const payment = await adapter.createPayment({
      paymentId: "payment-1",
      quizSessionId: "session-1",
      amountMinor: 9900,
      currency: "ILS",
      notifyUrl: "https://lovlov.me/api/payments/ching/webhook?payment=payment-1",
      successUrl: "https://lovlov.me/payment/return?payment=payment-1",
      failureUrl: "https://lovlov.me/payment/return?payment=payment-1&cancelled=1",
      itemName: "Paid relationship report",
      customerName: "Guest",
      customerEmail: "guest@example.com",
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://api.ching.co.il/ching/v1/customers/upsert");
    expect(calls[0].init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer ck_test_key",
    });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      identifyBy: "email",
      email: "guest@example.com",
      name: "Guest",
    });

    expect(calls[1].url).toBe("https://api.ching.co.il/ching/v1/checkout_sessions");
    expect(JSON.parse(String(calls[1].init.body))).toEqual({
      customer: "cus_123",
      line_items: [{ name: "Paid relationship report", amount_agorot: 9900, quantity: 1 }],
      success_url: "https://lovlov.me/payment/return?payment=payment-1",
      cancel_url: "https://lovlov.me/payment/return?payment=payment-1&cancelled=1",
      create_document: true,
      metadata: { paymentId: "payment-1", quizSessionId: "session-1" },
    });

    expect(payment).toMatchObject({
      providerReference: "co_abc",
      redirectUrl: "https://secured.ching.co.il/co_abc",
      customerId: "cus_123",
    });
  });

  it("looks up CHING charges for a customer with bearer authentication", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const adapter = new RealChingAdapter(
      {
        endpointUrl: "https://api.ching.co.il/",
        apiKey: "ck_test_key",
      },
      async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify({ success: true, data: [{ id: "ch_1", status: "succeeded" }] }), {
          status: 200,
        });
      },
    );

    await expect(adapter.getChargesByCustomer("cus_123")).resolves.toEqual({
      success: true,
      data: [{ id: "ch_1", status: "succeeded" }],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.ching.co.il/ching/v1/charges?customer=cus_123");
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer ck_test_key",
    });
  });

  it("defaults the customer email when checkout customer details are missing", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const adapter = new RealChingAdapter(
      {
        endpointUrl: "https://api.ching.co.il",
        apiKey: "ck_test_key",
      },
      async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        if (String(url).endsWith("/customers/upsert")) {
          return new Response(JSON.stringify({ success: true, data: { id: "cus_123" } }), { status: 200 });
        }
        return new Response(
          JSON.stringify({ success: true, data: { id: "co_abc", url: "https://secured.ching.co.il/co_abc" } }),
          { status: 200 },
        );
      },
    );

    await adapter.createPayment({
      paymentId: "payment-1",
      quizSessionId: "session-1",
      amountMinor: 9900,
      currency: "ILS",
      notifyUrl: "https://lovlov.me/api/payments/ching/webhook?payment=payment-1",
      successUrl: "https://lovlov.me/payment/return?payment=payment-1",
      failureUrl: "https://lovlov.me/payment/return?payment=payment-1&cancelled=1",
    });

    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      identifyBy: "email",
      email: "payment-1@lovlov.me",
      name: "Guest",
    });
  });

  it("rejects CHING checkout sessions without a hosted url", async () => {
    const adapter = new RealChingAdapter(
      {
        endpointUrl: "https://api.ching.co.il/",
        apiKey: "ck_test_key",
      },
      async (url) =>
        String(url).endsWith("/customers/upsert")
          ? new Response(JSON.stringify({ success: true, data: { id: "cus_123" } }), { status: 200 })
          : new Response(JSON.stringify({ success: true, data: { id: "co_abc" } }), { status: 200 }),
    );

    await expect(
      adapter.createPayment({
        paymentId: "payment-1",
        quizSessionId: "session-1",
        amountMinor: 9900,
        currency: "ILS",
        notifyUrl: "https://lovlov.me/api/payments/ching/webhook?payment=payment-1",
        successUrl: "https://lovlov.me/payment/return?payment=payment-1",
        failureUrl: "https://lovlov.me/payment/return?payment=payment-1&cancelled=1",
      }),
    ).rejects.toThrow("CHING checkout creation failed");
  });

  it("rejects failed CHING HTTP responses", async () => {
    const adapter = new RealChingAdapter(
      {
        endpointUrl: "https://api.ching.co.il/",
        apiKey: "ck_test_key",
      },
      async () =>
        new Response(JSON.stringify({ success: false, error: { message: "boom" } }), { status: 500 }),
    );

    await expect(
      adapter.createPayment({
        paymentId: "payment-1",
        quizSessionId: "session-1",
        amountMinor: 9900,
        currency: "ILS",
        notifyUrl: "https://lovlov.me/api/payments/ching/webhook?payment=payment-1",
        successUrl: "https://lovlov.me/payment/return?payment=payment-1",
        failureUrl: "https://lovlov.me/payment/return?payment=payment-1&cancelled=1",
      }),
    ).rejects.toThrow("boom");
  });
});
