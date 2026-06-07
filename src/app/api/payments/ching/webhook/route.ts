import { finalizePaymentById } from "@/app/api/payments/finalize";
import { verifyChingSignature } from "@/domain/payments/ching-adapter";
import type { PaymentEvent, PaymentRecord } from "@/domain/payments/types";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

type DbPayment = {
  id: string;
  provider_reference: string;
  status: PaymentRecord["status"];
  amount_minor: number;
  currency: string;
  raw_payload: Record<string, unknown> | null;
};

const SUCCESS_EVENTS = new Set(["charge.succeeded", "charge.captured"]);
const FAILURE_EVENTS = new Set(["charge.failed", "charge.canceled"]);

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("Ching-Signature");

  if (!verifyChingSignature(rawBody, signature, process.env.CHING_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = parseJson(rawBody);
  if (!event || typeof event !== "object") {
    return NextResponse.json({ error: "JSON body is required" }, { status: 400 });
  }

  const eventType = readString(event, ["type"]);
  if (!eventType || (!SUCCESS_EVENTS.has(eventType) && !FAILURE_EVENTS.has(eventType))) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const charge = isRecord(event.data) ? event.data : {};
  const url = new URL(request.url);
  const paymentId = readPaymentId(charge) ?? url.searchParams.get("payment");

  if (!paymentId) {
    return NextResponse.json({ error: "Payment reference is missing" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data: payment, error } = await supabase
    .from("payments")
    .select("id, provider_reference, status, amount_minor, currency, raw_payload")
    .eq("id", paymentId)
    .maybeSingle<DbPayment>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!payment) {
    return NextResponse.json({ error: "Payment was not found" }, { status: 404 });
  }

  const success = SUCCESS_EVENTS.has(eventType);
  const transactionId = readString(charge, ["id", "charge", "transaction_id"]);
  const paymentEvent = buildPaymentEvent(payment, charge, success);

  if (paymentEvent.type === "paid") {
    if (paymentEvent.amountMinor !== payment.amount_minor) {
      return NextResponse.json({ error: "Payment amount mismatch" }, { status: 400 });
    }
    if (paymentEvent.currency !== payment.currency) {
      return NextResponse.json({ error: "Payment currency mismatch" }, { status: 400 });
    }
  }

  const rawPayload = isRecord(payment.raw_payload) ? payment.raw_payload : {};

  try {
    const result = await finalizePaymentById(payment.id, paymentEvent);
    const webhookPayloads = Array.isArray(rawPayload.webhookPayloads) ? rawPayload.webhookPayloads : [];
    const nextRawPayload = {
      ...rawPayload,
      ...(result.claimToken ? { claimToken: result.claimToken } : {}),
      ...(transactionId ? { providerTransactionId: transactionId } : {}),
      webhookPayloads: [...webhookPayloads, event],
    };

    const updatePayload: Record<string, unknown> = {
      raw_payload: nextRawPayload,
      updated_at: new Date().toISOString(),
    };

    if (transactionId) {
      updatePayload.provider_reference = transactionId;
    }

    const { error: updateError } = await supabase.from("payments").update(updatePayload).eq("id", payment.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({ ok: true, status: result.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "לא הצלחנו לעבד את עדכון התשלום" },
      { status: 400 },
    );
  }
}

function buildPaymentEvent(payment: DbPayment, charge: Record<string, unknown>, success: boolean): PaymentEvent {
  if (success) {
    return {
      type: "paid",
      providerReference: payment.provider_reference,
      amountMinor: readAmountMinor(charge) ?? payment.amount_minor,
      currency: readString(charge, ["currency"])?.toUpperCase() ?? payment.currency,
    };
  }

  return {
    type: "failed",
    providerReference: payment.provider_reference,
    reason: readString(charge, ["failure_reason", "cancellation_reason", "status"]) ?? "ching_charge_failed",
  };
}

function readPaymentId(charge: Record<string, unknown>): string | null {
  const metadata = isRecord(charge.metadata) ? charge.metadata : null;
  if (metadata) {
    const value = readString(metadata, ["paymentId", "payment_id"]);
    if (value) {
      return value;
    }
  }

  return null;
}

function readAmountMinor(charge: Record<string, unknown>): number | null {
  const amount = charge.amount_captured ?? charge.amount ?? charge.amount_agorot;
  if (typeof amount === "number") {
    return Math.round(amount);
  }
  if (typeof amount === "string" && amount.trim() !== "") {
    return Math.round(Number(amount));
  }

  return null;
}

function readString(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
  }

  return null;
}

function parseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
