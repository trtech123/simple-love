import { describe, expect, it } from "vitest";
import {
  buildPaymentRecoveryAudit,
  canCreateReplacementCheckout,
  canRecoverPayment,
  collectProviderTransactionIds,
  summarizeProviderReconciliationStatus,
} from "../../src/domain/payments/recovery";

describe("payment recovery rules", () => {
  it("allows operational recovery for unpaid payment states only", () => {
    expect(canRecoverPayment({ status: "created" })).toBe(true);
    expect(canRecoverPayment({ status: "pending" })).toBe(true);
    expect(canRecoverPayment({ status: "failed" })).toBe(true);
    expect(canRecoverPayment({ status: "cancelled" })).toBe(true);
    expect(canRecoverPayment({ status: "paid" })).toBe(false);
  });

  it("allows replacement checkout creation only after failure or cancellation", () => {
    expect(canCreateReplacementCheckout({ status: "failed" })).toBe(true);
    expect(canCreateReplacementCheckout({ status: "cancelled" })).toBe(true);
    expect(canCreateReplacementCheckout({ status: "created" })).toBe(false);
    expect(canCreateReplacementCheckout({ status: "pending" })).toBe(false);
    expect(canCreateReplacementCheckout({ status: "paid" })).toBe(false);
  });

  it("builds an audit log for payment recovery actions", () => {
    expect(
      buildPaymentRecoveryAudit({
        action: "payment.mark_failed",
        actorUserId: "admin-1",
        paymentId: "payment-1",
        oldStatus: "pending",
        newStatus: "failed",
        reason: "Customer abandoned checkout",
        replacementPaymentId: "payment-2",
      }),
    ).toEqual({
      actor_user_id: "admin-1",
      action: "payment.mark_failed",
      target_table: "payments",
      target_id: "payment-1",
      metadata: {
        action: "payment.mark_failed",
        actorUserId: "admin-1",
        paymentId: "payment-1",
        oldStatus: "pending",
        newStatus: "failed",
        reason: "Customer abandoned checkout",
        replacementPaymentId: "payment-2",
      },
    });
  });

  it("collects provider transaction ids from webhook-stored payloads", () => {
    expect(
      collectProviderTransactionIds({
        providerTransactionId: "tx-1",
        webhookPayloads: [
          { transactionId: "tx-2" },
          { transactionID: "tx-2" },
          { transaction_id: "tx-3" },
          { reference: 4004 },
        ],
      }),
    ).toEqual(["tx-1", "tx-2", "tx-3", "4004"]);
  });

  it("summarizes documented transactionsInfo success status for admin display", () => {
    expect(
      summarizeProviderReconciliationStatus({
        transactionsInfo: [
          {
            cashierid: "7886",
            providercashierstatus: "000",
            transferstatus: "S",
          },
        ],
      }),
    ).toBe("paid evidence, transfer S");
  });
});
