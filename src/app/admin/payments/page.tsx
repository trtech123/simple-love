import {
  canCreateReplacementCheckout,
  canRecoverPayment,
  summarizeProviderReconciliationStatus,
} from "@/domain/payments/recovery";
import type { PaymentStatus } from "@/domain/payments/types";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  createReplacementCheckoutFormAction,
  markPaymentCancelledAction,
  markPaymentFailedAction,
  reconcilePaymentAction,
  updatePaymentProductAction,
} from "../actions/payments";
import { paymentStatusLabel } from "../admin-copy";

export const dynamic = "force-dynamic";

type PaymentRow = {
  id: string;
  quiz_session_id: string;
  provider: string;
  provider_reference: string;
  status: PaymentStatus;
  amount_minor: number;
  currency: string;
  created_at: string;
  raw_payload: Record<string, unknown> | null;
};

type PaymentProductRow = {
  product_key: "paid_report" | "matching_unlock";
  amount_minor: number;
  currency: "ILS";
  item_name: string;
  active: boolean;
};

export default async function AdminPaymentsPage() {
  const supabase = createServiceRoleClient();
  const { data: products } = await supabase
    .from("payment_products")
    .select("product_key, amount_minor, currency, item_name, active")
    .order("product_key", { ascending: true })
    .returns<PaymentProductRow[]>();
  const { data: payments } = await supabase
    .from("payments")
    .select("id, quiz_session_id, provider, provider_reference, status, amount_minor, currency, created_at, raw_payload")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<PaymentRow[]>();
  const rows = payments ?? [];
  const paymentsById = new Map(rows.map((payment) => [payment.id, payment]));

  return (
    <main>
      <h1>{"\u05e0\u05d9\u05d4\u05d5\u05dc \u05ea\u05e9\u05dc\u05d5\u05de\u05d9\u05dd"}</h1>
      <p>סטטוס CHING עדכני, מחירי מוצרים, מזהי ספק ותשלומים משויכים.</p>
      <section className="admin-section">
        <h2>מוצרי תשלום</h2>
        <div className="admin-table-wrapper" style={{ maxWidth: "100%", overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>מוצר</th>
                <th>סכום</th>
                <th>שם פריט</th>
                <th>פעיל</th>
                <th>שמירה</th>
              </tr>
            </thead>
            <tbody>
              {(products ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5}>אין רשומות להצגה</td>
                </tr>
              ) : (
                (products ?? []).map((product) => (
              <tr key={product.product_key}>
                <td>
                  <code>{product.product_key}</code>
                </td>
                <td>
                  <form id={`product-${product.product_key}`} action={updatePaymentProductAction}>
                    <input type="hidden" name="productKey" value={product.product_key} />
                    <input
                      className="payment-reason"
                      name="amount"
                      type="number"
                      min="1"
                      step="0.01"
                      defaultValue={(product.amount_minor / 100).toFixed(2)}
                      aria-label={`סכום עבור ${product.product_key}`}
                    />{" "}
                    {product.currency}
                  </form>
                </td>
                <td>
                  <input
                    className="payment-reason"
                    name="itemName"
                    form={`product-${product.product_key}`}
                    defaultValue={product.item_name}
                    aria-label={`שם פריט עבור ${product.product_key}`}
                    required
                  />
                </td>
                <td>
                  <input
                    name="active"
                    form={`product-${product.product_key}`}
                    type="checkbox"
                    defaultChecked={product.active}
                    aria-label={`פעילות ${product.product_key}`}
                  />
                </td>
                <td>
                  <button className="secondary-button" type="submit" form={`product-${product.product_key}`}>
                    שמירה
                  </button>
                </td>
              </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      <div className="admin-table-wrapper" style={{ maxWidth: "100%", overflowX: "auto" }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>מזהה תשלום</th>
              <th>סטטוס</th>
              <th>סכום</th>
              <th>ספק</th>
              <th>מזהה ספק</th>
              <th>לקוח CHING</th>
              <th>בדיקת ספק</th>
              <th>החלפה</th>
              <th>שחזור</th>
              <th>נוצר</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10}>אין רשומות להצגה</td>
              </tr>
            ) : (
              rows.map((payment) => {
              const rawPayload = normalizeRawPayload(payment.raw_payload);
              const customerId = typeof rawPayload.customerId === "string" ? rawPayload.customerId : null;
              const latestReconciliation = getLatestReconciliation(rawPayload);
              const replacement = getReplacementSummary(payment, paymentsById);
              const showReconcile = canRecoverPayment(payment) && Boolean(customerId);
              const showMarkFailed = payment.status === "created" || payment.status === "pending";
              const showMarkCancelled =
                payment.status === "created" || payment.status === "pending" || payment.status === "failed";
              const showReplacement = canCreateReplacementCheckout(payment);

              return (
                <tr key={payment.id}>
                  <td>
                    <code>{payment.id}</code>
                  </td>
                  <td>{paymentStatusLabel(payment.status)}</td>
                  <td>
                    {(payment.amount_minor / 100).toFixed(2)} {payment.currency}
                  </td>
                  <td>{payment.provider}</td>
                  <td>
                    <code>{payment.provider_reference}</code>
                  </td>
                  <td>{customerId ? <code>{customerId}</code> : "-"}</td>
                  <td>
                    {latestReconciliation ? (
                      <div className="payment-meta-stack">
                        <span>{new Date(latestReconciliation.at).toLocaleString("he-IL")}</span>
                        <span>{latestReconciliation.status}</span>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    {replacement ? (
                      <div className="payment-meta-stack">
                        <span>{replacement.label}</span>
                        {replacement.redirectUrl ? (
                          <a className="secondary-link payment-link" href={replacement.redirectUrl}>
                            תשלום
                          </a>
                        ) : null}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    <div className="payment-recovery-controls">
                      {showReconcile ? (
                        <form action={reconcilePaymentAction}>
                          <input type="hidden" name="paymentId" value={payment.id} />
                          <button className="secondary-button" type="submit">
                            בדיקת ספק
                          </button>
                        </form>
                      ) : null}
                      {showMarkFailed ? (
                        <form className="payment-action-form" action={markPaymentFailedAction}>
                          <input type="hidden" name="paymentId" value={payment.id} />
                          <input
                            className="payment-reason"
                            name="reason"
                            aria-label={`סיבת כישלון עבור ${payment.id}`}
                            placeholder="סיבה"
                            required
                          />
                          <button className="secondary-button" type="submit">
                            סימון כנכשל
                          </button>
                        </form>
                      ) : null}
                      {showMarkCancelled ? (
                        <form className="payment-action-form" action={markPaymentCancelledAction}>
                          <input type="hidden" name="paymentId" value={payment.id} />
                          <input
                            className="payment-reason"
                            name="reason"
                            aria-label={`סיבת ביטול עבור ${payment.id}`}
                            placeholder="סיבה"
                            required
                          />
                          <button className="secondary-button" type="submit">
                            סימון כמבוטל
                          </button>
                        </form>
                      ) : null}
                      {showReplacement ? (
                        <form action={createReplacementCheckoutFormAction}>
                          <input type="hidden" name="paymentId" value={payment.id} />
                          <button className="secondary-button" type="submit">
                            יצירת תשלום חלופי
                          </button>
                        </form>
                      ) : null}
                      {!showReconcile && !showMarkFailed && !showMarkCancelled && !showReplacement ? "-" : null}
                    </div>
                  </td>
                  <td>{new Date(payment.created_at).toLocaleString("he-IL")}</td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function getLatestReconciliation(rawPayload: Record<string, unknown>) {
  const payloads = Array.isArray(rawPayload.reconciliationPayloads) ? rawPayload.reconciliationPayloads : [];
  const latest = payloads[payloads.length - 1];
  if (!isRecord(latest) || typeof latest.at !== "string") {
    return null;
  }

  return {
    at: latest.at,
    status: summarizeProviderStatus(latest.response),
  };
}

function getReplacementSummary(payment: PaymentRow, paymentsById: Map<string, PaymentRow>) {
  const rawPayload = normalizeRawPayload(payment.raw_payload);
  if (typeof rawPayload.replacementForPaymentId === "string") {
    return {
      label: `תשלום חלופי עבור ${rawPayload.replacementForPaymentId}`,
      redirectUrl: typeof rawPayload.redirectUrl === "string" ? rawPayload.redirectUrl : null,
    };
  }

  if (typeof rawPayload.replacedByPaymentId === "string") {
    const replacement = paymentsById.get(rawPayload.replacedByPaymentId);
    const replacementRawPayload = normalizeRawPayload(replacement?.raw_payload);
    return {
      label: `הוחלף על ידי ${rawPayload.replacedByPaymentId}`,
      redirectUrl: typeof replacementRawPayload.redirectUrl === "string" ? replacementRawPayload.redirectUrl : null,
    };
  }

  return null;
}

function summarizeProviderStatus(value: unknown) {
  return summarizeProviderReconciliationStatus(value);
}

function normalizeRawPayload(rawPayload: Record<string, unknown> | null | undefined) {
  return rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload) ? rawPayload : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
