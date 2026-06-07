"use client";

import { useEffect, useMemo, useState } from "react";
import type { PaymentReturnStatus } from "@/domain/payments/return-status";

type PaymentStatusPollerProps = {
  paymentId: string;
  initialStatus: PaymentReturnStatus;
};

const terminalStates = new Set<PaymentReturnStatus["state"]>([
  "not_found",
  "payment_failed",
  "payment_cancelled",
  "report_failed",
  "report_ready",
  "matching_unlocked",
]);

export function PaymentStatusPoller({ paymentId, initialStatus }: PaymentStatusPollerProps) {
  const [status, setStatus] = useState<PaymentReturnStatus>(initialStatus);
  const statusUrl = useMemo(() => `/api/payments/status?payment=${encodeURIComponent(paymentId)}`, [paymentId]);

  useEffect(() => {
    if (terminalStates.has(status.state)) {
      if (status.state === "report_ready") {
        window.location.assign(`/report/${encodeURIComponent(status.claimToken)}`);
      }
      if (status.state === "matching_unlocked") {
        window.location.assign("/matches");
      }
      return;
    }

    let cancelled = false;

    async function poll() {
      const response = await fetch(statusUrl, { cache: "no-store" }).catch(() => null);
      if (!response?.ok || cancelled) {
        return;
      }

      const nextStatus = (await response.json()) as PaymentReturnStatus;
      if (cancelled) {
        return;
      }

      setStatus(nextStatus);
    }

    void poll();
    const interval = window.setInterval(() => void poll(), 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [status, statusUrl]);

  return (
    <p className="session-token payment-status-line" aria-live="polite" data-status-url={statusUrl}>
      {statusText(status)}
    </p>
  );
}

function statusText(status: PaymentReturnStatus) {
  if (status.state === "report_generating") {
    return "התשלום אושר. הדוח שלך בהכנה.";
  }
  if (status.state === "report_ready") {
    return "הדוח מוכן. פותחים אותו עכשיו.";
  }
  if (status.state === "matching_unlocked") {
    return "ההתאמות נפתחו. פותחים אותן עכשיו.";
  }
  if (status.state === "payment_failed") {
    return "התשלום נכשל. אפשר לחזור לשאלון השמור.";
  }
  if (status.state === "payment_cancelled") {
    return "התשלום בוטל. אפשר לחזור לשאלון השמור.";
  }
  if (status.state === "report_failed") {
    return "הפקת הדוח נכשלה.";
  }
  if (status.state === "not_found") {
    return "התשלום לא נמצא.";
  }

  return "בודקים את סטטוס התשלום כל כמה שניות.";
}
