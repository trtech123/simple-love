import type { PaymentProductKey } from "./products";

export type PaymentStatus = "created" | "pending" | "paid" | "failed" | "cancelled";

export type PaymentRecord = {
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  providerReference: string;
  productKey?: PaymentProductKey;
};

export type PaymentEvent =
  | { type: "paid"; amountMinor: number; currency: string; providerReference: string }
  | { type: "failed"; providerReference: string; reason: string }
  | { type: "cancelled"; providerReference: string };
