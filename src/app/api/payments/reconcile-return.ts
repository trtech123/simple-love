import { finalizePaymentById } from "@/app/api/payments/finalize";
import { createChingAdapter } from "@/domain/payments/ching-adapter";
import type { PaymentEvent, PaymentRecord } from "@/domain/payments/types";
import { createServiceRoleClient } from "@/lib/supabase/admin";

type DbPayment = {
  id: string;
  provider_reference: string;
  status: PaymentRecord["status"];
  amount_minor: number;
  currency: string;
  raw_payload: Record<string, unknown> | null;
};

const SUCCESS_STATUSES = new Set(["succeeded", "success", "successful", "paid", "captured", "charge.succeeded", "charge.captured"]);

export async function reconcileReturnedPayment(paymentId: string) {
  const supabase = createServiceRoleClient();
  const { data: payment, error } = await supabase
    .from("payments")
    .select("id, provider_reference, status, amount_minor, currency, raw_payload")
    .eq("id", paymentId)
    .maybeSingle<DbPayment>();

  if (error || !payment || (payment.status !== "created" && payment.status !== "pending")) {
    return { reconciled: false };
  }

  const rawPayload = normalizeRawPayload(payment.raw_payload);
  const customerId = typeof rawPayload.customerId === "string" ? rawPayload.customerId : null;
  if (!customerId) {
    return { reconciled: false };
  }

  const adapter = createChingAdapter();
  if (!adapter.getChargesByCustomer) {
    return { reconciled: false };
  }

  const response = await adapter.getChargesByCustomer(customerId).catch(() => null);
  const event = response ? findSuccessfulPaymentEvent(response, payment) : null;
  if (!event) {
    return { reconciled: false };
  }

  await finalizePaymentById(payment.id, event);
  return { reconciled: true };
}

function findSuccessfulPaymentEvent(response: unknown, payment: DbPayment): PaymentEvent | null {
  for (const charge of collectRecords(response)) {
    if (!isSuccessfulCharge(charge) || !matchesPaymentId(charge, payment.id)) {
      continue;
    }

    const amountMinor = readAmountMinor(charge) ?? payment.amount_minor;
    const currency = readString(charge, ["currency"])?.toUpperCase() ?? payment.currency;
    if (amountMinor !== payment.amount_minor || currency !== payment.currency) {
      continue;
    }

    return {
      type: "paid",
      providerReference: payment.provider_reference,
      amountMinor,
      currency,
    };
  }

  return null;
}

function isSuccessfulCharge(charge: Record<string, unknown>) {
  const statuses = ["status", "payment_status", "paymentStatus", "type"].flatMap((key) => {
    const value = charge[key];
    return typeof value === "string" ? [value.trim().toLowerCase()] : [];
  });

  return statuses.some((status) => SUCCESS_STATUSES.has(status));
}

function matchesPaymentId(charge: Record<string, unknown>, paymentId: string) {
  const metadata = normalizeRawPayload(charge.metadata);
  const metadataPaymentId = readString(metadata, ["paymentId", "payment_id"]);

  return !metadataPaymentId || metadataPaymentId === paymentId;
}

function collectRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectRecords);
  }

  if (!isRecord(value)) {
    return [];
  }

  const direct = "status" in value || "payment_status" in value || "paymentStatus" in value ? [value] : [];
  const nested = ["data", "charges", "items", "results"].flatMap((key) => collectRecords(value[key]));
  return [...direct, ...nested];
}

function readAmountMinor(charge: Record<string, unknown>) {
  const amount = charge.amount_captured ?? charge.amount ?? charge.amount_agorot;
  if (typeof amount === "number" && Number.isFinite(amount)) {
    return Math.round(amount);
  }
  if (typeof amount === "string" && amount.trim() !== "") {
    const parsed = Number(amount);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }

  return null;
}

function readString(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  return null;
}

function normalizeRawPayload(value: unknown) {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
