import { buildAuditLog } from "@/domain/admin/audit";
import type { PaymentStatus } from "./types";

export type PaymentRecoveryAction =
  | "payment.reconcile"
  | "payment.mark_failed"
  | "payment.mark_cancelled"
  | "payment.create_replacement";

export type PaymentRecoveryActionPayload = {
  action: PaymentRecoveryAction;
  actorUserId: string;
  paymentId: string;
  oldStatus: PaymentStatus;
  newStatus: PaymentStatus;
  reason: string;
  at?: string;
  replacementPaymentId?: string;
};

export function canRecoverPayment(payment: { status: PaymentStatus }) {
  return payment.status !== "paid";
}

export function canCreateReplacementCheckout(payment: { status: PaymentStatus }) {
  return payment.status === "failed" || payment.status === "cancelled";
}

export function buildPaymentRecoveryAudit(input: PaymentRecoveryActionPayload) {
  const metadata: Record<string, unknown> = {
    action: input.action,
    actorUserId: input.actorUserId,
    paymentId: input.paymentId,
    oldStatus: input.oldStatus,
    newStatus: input.newStatus,
    reason: input.reason,
  };

  if (input.replacementPaymentId) {
    metadata.replacementPaymentId = input.replacementPaymentId;
  }

  return buildAuditLog({
    actorUserId: input.actorUserId,
    action: input.action,
    targetTable: "payments",
    targetId: input.paymentId,
    metadata,
  });
}

export function buildPaymentRecoveryPayload(input: PaymentRecoveryActionPayload) {
  return {
    action: input.action,
    actorUserId: input.actorUserId,
    paymentId: input.paymentId,
    oldStatus: input.oldStatus,
    newStatus: input.newStatus,
    reason: input.reason,
    at: input.at ?? new Date().toISOString(),
    ...(input.replacementPaymentId ? { replacementPaymentId: input.replacementPaymentId } : {}),
  };
}

export function collectProviderTransactionIds(rawPayload: Record<string, unknown> | null | undefined) {
  if (!rawPayload) {
    return [];
  }

  const ids = new Set<string>();
  addTransactionId(ids, rawPayload.providerTransactionId);

  const webhookPayloads = Array.isArray(rawPayload.webhookPayloads) ? rawPayload.webhookPayloads : [];
  for (const payload of webhookPayloads) {
    if (isRecord(payload)) {
      addTransactionId(ids, payload.transactionId);
      addTransactionId(ids, payload.transactionID);
      addTransactionId(ids, payload.transaction_id);
      addTransactionId(ids, payload.reference);
    }
  }

  return [...ids];
}

export function summarizeProviderReconciliationStatus(value: unknown) {
  const statuses = collectProviderStatuses(value);
  return statuses.length > 0 ? statuses.join(", ") : "Stored";
}

function collectProviderStatuses(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap((item) => collectProviderStatuses(item)))];
  }
  if (!isRecord(value)) {
    return [];
  }

  const statuses: string[] = [];
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && item.trim() !== "") {
      const normalizedKey = key.toLowerCase();
      const normalizedValue = item.trim();
      if (normalizedKey === "providercashierstatus") {
        statuses.push(normalizedValue === "000" ? "paid evidence" : `provider ${normalizedValue}`);
        continue;
      }
      if (normalizedKey === "transferstatus") {
        statuses.push(`transfer ${normalizedValue}`);
        continue;
      }
      if (
        ["status", "transactionstatus", "transaction_status", "paymentstatus", "payment_status"].includes(
          normalizedKey,
        )
      ) {
        statuses.push(normalizedValue);
      }
    }

    if (isRecord(item) || Array.isArray(item)) {
      statuses.push(...collectProviderStatuses(item));
    }
  }

  return [...new Set(statuses)];
}

function addTransactionId(ids: Set<string>, value: unknown) {
  if (typeof value === "string" && value.trim() !== "") {
    ids.add(value);
    return;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    ids.add(String(value));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
