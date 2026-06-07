import Link from "next/link";
import { finalizePaymentById } from "@/app/api/payments/finalize";
import { CheckCircle2, Clock, FileWarning, HeartHandshake, RotateCcw } from "lucide-react";
import { FunnelCard, FunnelShell, FunnelStateIcon } from "@/components/funnel";
import { getPaymentReturnStatus, type PaymentReturnStatus } from "@/domain/payments/return-status";
import { PaymentStatusPoller } from "./payment-status-poller";

export const dynamic = "force-dynamic";

export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string; mockPayment?: string; cancelled?: string }>;
}) {
  const params = await searchParams;

  if (!params.payment) {
    return (
      <FunnelShell>
        <FunnelCard>
          <h1>התשלום לא נמצא</h1>
          <p>קישור החזרה חסר מזהה תשלום.</p>
        </FunnelCard>
      </FunnelShell>
    );
  }

  const isMockPaid = params.mockPayment === "paid" && isMockPaidReturnEnabled();
  const status = isMockPaid
    ? statusFromFinalizeResult(await finalizePaymentById(params.payment))
    : await getPaymentReturnStatus(params.payment, { browserCancelled: Boolean(params.cancelled) }).catch(
        () => ({ state: "payment_pending" }) as PaymentReturnStatus,
      );

  const content = paymentReturnContent(status);
  const isWaiting = status.state === "payment_pending" || status.state === "report_generating";

  return (
    <FunnelShell>
      <FunnelCard className="payment-panel--centered">
        <FunnelStateIcon icon={iconForStatus(status)} />
        <h1>{content.title}</h1>
        <p>{content.body}</p>
        {renderPaymentAction(status, params.payment)}
        {isWaiting ? <p className="funnel-mini-note">אפשר להשאיר את העמוד פתוח. הוא יתעדכן לבד.</p> : null}
      </FunnelCard>
    </FunnelShell>
  );
}

function isMockPaidReturnEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1";
}

function iconForStatus(status: PaymentReturnStatus) {
  if (status.state === "report_ready") {
    return CheckCircle2;
  }
  if (status.state === "matching_unlocked") {
    return HeartHandshake;
  }
  if (status.state === "payment_failed" || status.state === "payment_cancelled") {
    return RotateCcw;
  }
  if (status.state === "report_failed" || status.state === "not_found") {
    return FileWarning;
  }
  return Clock;
}

function statusFromFinalizeResult(result: {
  claimToken: string | null;
  reportStatus?: string;
  matchingUnlocked?: boolean;
}): PaymentReturnStatus {
  if (result.matchingUnlocked) {
    return { state: "matching_unlocked" };
  }

  if (result.claimToken) {
    return { state: "report_ready", claimToken: result.claimToken };
  }

  if (result.reportStatus === "failed") {
    return { state: "report_failed" };
  }

  return { state: "report_generating" };
}

function paymentReturnContent(status: PaymentReturnStatus) {
  switch (status.state) {
    case "not_found":
      return {
        title: "התשלום לא נמצא",
        body: "קישור החזרה לא תואם תשלום שמור.",
      };
    case "payment_failed":
      return {
        title: "התשלום לא עבר",
        body: "התשובות שלך נשמרו. אפשר לחזור לשאלון ולנסות לשלם שוב כשנוח לך.",
      };
    case "payment_cancelled":
      return {
        title: "התשלום בוטל",
        body: "התשובות שלך נשמרו. אפשר לחזור לשאלון אם תרצו לנסות לשלם שוב.",
      };
    case "report_generating":
      return {
        title: "הדוח בהכנה",
        body: "התשלום אושר. אנחנו מפיקים את הדוח האישי ונפתח אותו אוטומטית.",
      };
    case "report_failed":
      return {
        title: "הפקת הדוח נכשלה",
        body: "התשלום התקבל, אבל הדוח לא הופק. נדרש טיפול תמיכה או ניסיון חוזר במערכת הניהול.",
      };
    case "report_ready":
      return {
        title: "ברוכים הבאים!",
        body: "התשלום התקבל והדוח האישי שלך מוכן.",
      };
    case "matching_unlocked":
      return {
        title: "ההתאמות נפתחו",
        body: "ההתאמות והשיחות זמינות עכשיו.",
      };
    case "payment_pending":
    default:
      return {
        title: "אנחנו מאשרים את התשלום",
        body: "אנחנו ממתינים לאישור מאומת מספק התשלום. העמוד יתעדכן אוטומטית.",
      };
  }
}

function renderPaymentAction(status: PaymentReturnStatus, paymentId: string) {
  if (status.state === "report_ready") {
    return (
      <Link className="primary-link" href={`/report/${encodeURIComponent(status.claimToken)}`}>
        פתיחת הדוח
      </Link>
    );
  }

  if (status.state === "matching_unlocked") {
    return (
      <Link className="primary-link" href="/matches">
        פתיחת ההתאמות
      </Link>
    );
  }

  if (status.state === "payment_failed" || status.state === "payment_cancelled") {
    return (
      <Link className="primary-link" href={status.retryQuizUrl}>
        חזרה לשאלון השמור
      </Link>
    );
  }

  if (status.state === "payment_pending" || status.state === "report_generating") {
    return <PaymentStatusPoller paymentId={paymentId} initialStatus={status} />;
  }

  return null;
}
