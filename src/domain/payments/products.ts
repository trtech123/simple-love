export type PaymentProductKey = "paid_report" | "matching_unlock";

export type PaymentProduct = {
  key: PaymentProductKey;
  amountMinor: number;
  currency: "ILS";
  itemName: string;
  active: boolean;
};

export type PaymentProductRepository = {
  getPaymentProduct(key: PaymentProductKey): Promise<PaymentProduct | null>;
};

export type PaymentProductLookupOptions = {
  shouldFallbackOnLookupError?: (error: unknown) => boolean;
};

const DEFAULT_PRODUCTS: Record<PaymentProductKey, PaymentProduct> = {
  paid_report: {
    key: "paid_report",
    amountMinor: 9900,
    currency: "ILS",
    itemName: "דוח עומק זוגי",
    active: true,
  },
  matching_unlock: {
    key: "matching_unlock",
    amountMinor: 9900,
    currency: "ILS",
    itemName: "פתיחת התאמות וצ'אט",
    active: true,
  },
};

export function getDefaultPaymentProduct(key: PaymentProductKey): PaymentProduct {
  return DEFAULT_PRODUCTS[key];
}

export function parsePaymentProductKey(value: unknown): PaymentProductKey | null {
  return value === "paid_report" || value === "matching_unlock" ? value : null;
}

export async function resolvePaymentProduct(
  repository: PaymentProductRepository,
  key: PaymentProductKey,
  options: PaymentProductLookupOptions = {},
): Promise<PaymentProduct> {
  let managed: PaymentProduct | null;
  try {
    managed = await repository.getPaymentProduct(key);
  } catch (error) {
    if (options.shouldFallbackOnLookupError?.(error)) {
      return getDefaultPaymentProduct(key);
    }

    throw error;
  }

  if (managed?.active) {
    return managed;
  }

  return getDefaultPaymentProduct(key);
}

export function isMissingPaymentProductsTableError(error: unknown): boolean {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
  const code = typeof record?.code === "string" ? record.code : "";
  const message =
    error instanceof Error
      ? error.message
      : typeof record?.message === "string"
        ? record.message
        : "";

  return code === "PGRST205" || (message.includes("payment_products") && message.includes("schema cache"));
}
