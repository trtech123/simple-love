import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

describe("/payment/mock page", () => {
  it("renders the local secure payment summary and finalization link", async () => {
    const Page = (await import("../../src/app/payment/mock/page")).default;
    const element = await Page({ searchParams: Promise.resolve({ payment: "payment-1" }) });
    const html = renderToString(element);

    expect(html).toContain("תשלום מאובטח");
    expect(html).toContain("99 ש״ח");
    expect(html).toContain('href="/payment/return?payment=payment-1&amp;mockPayment=paid"');
    expect(html).toContain("LovLov cupid");
    expect(html).toContain("mock-payment-layout");
  });
});
