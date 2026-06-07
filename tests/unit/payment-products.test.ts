import { describe, expect, it } from "vitest";
import { getDefaultPaymentProduct, resolvePaymentProduct } from "../../src/domain/payments/products";

describe("payment products", () => {
  it("defines 99 ILS defaults for both paid stages", () => {
    expect(getDefaultPaymentProduct("paid_report")).toMatchObject({
      key: "paid_report",
      amountMinor: 9900,
      currency: "ILS",
    });
    expect(getDefaultPaymentProduct("matching_unlock")).toMatchObject({
      key: "matching_unlock",
      amountMinor: 9900,
      currency: "ILS",
    });
  });

  it("uses an active admin-managed product price when present", async () => {
    const product = await resolvePaymentProduct(
      {
        async getPaymentProduct(key) {
          return key === "matching_unlock"
            ? {
                key,
                amountMinor: 12500,
                currency: "ILS",
                itemName: "Matching unlock",
                active: true,
              }
            : null;
        },
      },
      "matching_unlock",
    );

    expect(product.amountMinor).toBe(12500);
  });

  it("falls back to the default price when admin product is missing or inactive", async () => {
    await expect(resolvePaymentProduct({ async getPaymentProduct() { return null; } }, "paid_report")).resolves.toMatchObject({
      amountMinor: 9900,
      currency: "ILS",
    });
    await expect(
      resolvePaymentProduct(
        {
          async getPaymentProduct(key) {
            return { key, amountMinor: 4500, currency: "ILS", itemName: "Inactive", active: false };
          },
        },
        "paid_report",
      ),
    ).resolves.toMatchObject({ amountMinor: 9900 });
  });

  it("falls back to the default price when the optional managed product lookup is unavailable", async () => {
    await expect(
      resolvePaymentProduct(
        {
          async getPaymentProduct() {
            throw new Error("Could not find the table 'public.payment_products' in the schema cache");
          },
        },
        "paid_report",
        {
          shouldFallbackOnLookupError(error) {
            return error instanceof Error && error.message.includes("payment_products");
          },
        },
      ),
    ).resolves.toMatchObject({
      amountMinor: 9900,
      currency: "ILS",
    });
  });
});
