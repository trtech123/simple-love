import React from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

const mocks = vi.hoisted(() => ({
  finalizePaymentById: vi.fn(),
  getPaymentReturnStatus: vi.fn(),
}));

vi.mock("@/app/api/payments/finalize", () => ({
  finalizePaymentById: (paymentId: string) => mocks.finalizePaymentById(paymentId),
}));

vi.mock("@/domain/payments/return-status", () => ({
  getPaymentReturnStatus: (paymentId: string, options?: unknown) => mocks.getPaymentReturnStatus(paymentId, options),
}));

vi.mock("next/font/google", () => ({
  Assistant: () => ({ className: "font-assistant" }),
  Frank_Ruhl_Libre: () => ({ className: "font-frank-ruhl" }),
}));

describe("/payment/return page", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.finalizePaymentById.mockReset();
    mocks.getPaymentReturnStatus.mockReset();
  });

  it("renders pending payment copy and polling UI", async () => {
    mocks.getPaymentReturnStatus.mockResolvedValue({ state: "payment_pending" });

    const html = await renderPaymentReturn({ payment: "payment-1" });
    expect(html).toContain("payment-return-page");
    expect(html).toContain("payment-return-shell");

    expect(html).toContain("אנחנו מאשרים את התשלום");
    expect(html).toContain("בודקים את סטטוס התשלום");
    expect(html).toContain("/api/payments/status?payment=payment-1");
    expect(html).toContain("LovLov cupid");
    expect(html).toContain("payment-state-chips");
    expect(html).toContain('aria-valuenow="28"');
  });

  it("renders failed and cancelled payment retry links for the original quiz session", async () => {
    mocks.getPaymentReturnStatus.mockResolvedValueOnce({
      state: "payment_failed",
      retryQuizUrl: "/quiz?session=public-token",
    });
    expect(await renderPaymentReturn({ payment: "failed-payment" })).toContain('href="/quiz?session=public-token"');

    mocks.getPaymentReturnStatus.mockResolvedValueOnce({
      state: "payment_cancelled",
      retryQuizUrl: "/quiz?session=public-token",
    });
    expect(await renderPaymentReturn({ payment: "cancelled-payment" })).toContain("התשלום בוטל");
    expect(mocks.getPaymentReturnStatus).toHaveBeenLastCalledWith("cancelled-payment", { browserCancelled: false });
  });

  it("renders report failure and ready states", async () => {
    mocks.getPaymentReturnStatus.mockResolvedValueOnce({ state: "report_failed" });
    expect(await renderPaymentReturn({ payment: "payment-1" })).toContain("הפקת הדוח נכשלה");

    mocks.getPaymentReturnStatus.mockResolvedValueOnce({ state: "report_ready", claimToken: "claim-token" });
    const readyHtml = await renderPaymentReturn({ payment: "payment-1" });
    expect(readyHtml).toContain("הדוח האישי שלך מוכן");
    expect(readyHtml).toContain('aria-valuenow="100"');
    expect(readyHtml).toContain('href="/report/claim-token"');
  });

  it("renders generating and matching unlocked high fidelity states", async () => {
    mocks.getPaymentReturnStatus.mockResolvedValueOnce({ state: "report_generating" });
    const generatingHtml = await renderPaymentReturn({ payment: "payment-1" });
    expect(generatingHtml).toContain("payment-return-title-script");
    expect(generatingHtml).toContain('aria-valuenow="64"');

    mocks.getPaymentReturnStatus.mockResolvedValueOnce({ state: "matching_unlocked" });
    const matchingHtml = await renderPaymentReturn({ payment: "payment-1" });
    expect(matchingHtml).toContain('href="/matches"');
    expect(matchingHtml).toContain('aria-valuenow="100"');
  });

  it("keeps mock paid returns finalizing and linking to the report", async () => {
    mocks.finalizePaymentById.mockResolvedValue({ status: "paid", claimToken: "claim-token" });

    const html = await renderPaymentReturn({ payment: "payment-1", mockPayment: "paid" });

    expect(mocks.finalizePaymentById).toHaveBeenCalledWith("payment-1");
    expect(html).toContain("ברוכים הבאים!");
    expect(html).toContain('href="/report/claim-token"');
  });
});

async function renderPaymentReturn(params: { payment?: string; mockPayment?: string; cancelled?: string }) {
  const Page = (await import("../../src/app/payment/return/page")).default;
  const element = await Page({ searchParams: Promise.resolve(params) });

  return renderToString(element);
}
