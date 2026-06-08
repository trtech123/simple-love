import Link from "next/link";
import { Assistant, Frank_Ruhl_Libre } from "next/font/google";
import { finalizePaymentById } from "@/app/api/payments/finalize";
import { Lovi, type LoviMood } from "@/components/brand/mascot";
import { getPaymentReturnStatus, type PaymentReturnStatus } from "@/domain/payments/return-status";
import { PaymentStatusPoller } from "./payment-status-poller";

export const dynamic = "force-dynamic";

const assistant = Assistant({
  subsets: ["hebrew", "latin"],
  weight: ["400", "600", "700", "800"],
});

const frankRuhl = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  weight: ["500", "700"],
});

type ReturnContent = {
  title: string;
  script?: string;
  body: string;
};

export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string; mockPayment?: string; cancelled?: string }>;
}) {
  const params = await searchParams;

  if (!params.payment) {
    return <PaymentReturnScreen status={{ state: "not_found" }} />;
  }

  const isMockPaid = params.mockPayment === "paid" && isMockPaidReturnEnabled();
  const status = isMockPaid
    ? statusFromFinalizeResult(await finalizePaymentById(params.payment))
    : await getPaymentReturnStatus(params.payment, { browserCancelled: Boolean(params.cancelled) }).catch(
        () => ({ state: "payment_pending" }) as PaymentReturnStatus,
      );

  return <PaymentReturnScreen paymentId={params.payment} status={status} />;
}

function PaymentReturnScreen({ status, paymentId }: { status: PaymentReturnStatus; paymentId?: string }) {
  const content = paymentReturnContent(status);
  const progress = progressForStatus(status);
  const isWaiting = Boolean(paymentId) && (status.state === "payment_pending" || status.state === "report_generating");

  return (
    <main className={`${assistant.className} payment-return-page`} dir="rtl">
      <section className="payment-return-shell" aria-label="סטטוס יצירת הדוח">
        <div className="payment-return-mascot">
          <Lovi size={92} mood={loviMoodForStatus(status)} />
        </div>
        <h1>
          {content.title}
          {content.script ? <span className={`${frankRuhl.className} payment-return-title-script`}>{content.script}</span> : null}
        </h1>
        <p className="payment-return-subcopy">{content.body}</p>
        <ReturnProgress activeState={status.state} value={progress} />
        {paymentId ? renderPaymentAction(status, paymentId) : null}
        <PaymentStateChips activeState={status.state} />
        {isWaiting ? <p className="payment-return-note">אפשר להשאיר את העמוד פתוח. הוא יתעדכן לבד.</p> : null}
      </section>
    </main>
  );
}

function isMockPaidReturnEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1";
}

function loviMoodForStatus(status: PaymentReturnStatus): LoviMood {
  if (status.state === "report_ready" || status.state === "matching_unlocked") {
    return "love";
  }
  if (status.state === "report_generating") {
    return "think";
  }
  if (status.state === "payment_failed" || status.state === "payment_cancelled" || status.state === "report_failed") {
    return "think";
  }
  return "smile";
}

function ReturnProgress({ activeState, value }: { activeState: PaymentReturnStatus["state"]; value: number }) {
  return (
    <div className="generation-steps" aria-label="התקדמות הפקת הדוח">
      <div className="generation-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <span style={{ width: `${value}%` }} />
      </div>
      <div className="generation-step-row">
        <span className={value >= 28 ? "is-done" : undefined}>התשלום אושר</span>
        <span className={value >= 64 ? "is-done" : undefined}>ניתוח תשובות</span>
        <span className={activeState === "report_generating" || value >= 100 ? "is-done" : undefined}>כתיבת תובנות</span>
        <span className={value >= 100 ? "is-done" : undefined}>סיום PDF</span>
      </div>
    </div>
  );
}

function PaymentStateChips({ activeState }: { activeState: PaymentReturnStatus["state"] }) {
  const states: Array<{ state: PaymentReturnStatus["state"]; label: string }> = [
    { state: "report_generating", label: "בתהליך" },
    { state: "report_ready", label: "מוכן" },
    { state: "payment_pending", label: "בהמתנה" },
    { state: "payment_cancelled", label: "בוטל" },
    { state: "payment_failed", label: "נכשל" },
    { state: "matching_unlocked", label: "התאמות נפתחו" },
  ];

  return (
    <div className="payment-state-chips" aria-label="סטטוסים זמינים">
      {states.map((item) => (
        <span className={item.state === activeState ? "is-active" : undefined} key={item.state}>
          {item.label}
        </span>
      ))}
    </div>
  );
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

function paymentReturnContent(status: PaymentReturnStatus): ReturnContent {
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
        title: "אנחנו כותבים לך את",
        script: "הדוח.",
        body: "התשלום אושר. LovLov קוראת את התשובות שלך ומרכיבה עבורך דוח אישי - זה בדרך כלל לוקח פחות מדקה.",
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

function progressForStatus(status: PaymentReturnStatus) {
  if (status.state === "payment_pending") {
    return 28;
  }
  if (status.state === "report_generating") {
    return 64;
  }
  if (status.state === "report_ready" || status.state === "matching_unlocked") {
    return 100;
  }
  return 18;
}

function renderPaymentAction(status: PaymentReturnStatus, paymentId: string) {
  if (status.state === "report_ready") {
    return (
      <Link className="primary-link payment-return-action" href={`/report/${encodeURIComponent(status.claimToken)}`}>
        פתיחת הדוח
      </Link>
    );
  }

  if (status.state === "matching_unlocked") {
    return (
      <Link className="primary-link payment-return-action" href="/matches">
        פתיחת ההתאמות
      </Link>
    );
  }

  if (status.state === "payment_failed" || status.state === "payment_cancelled") {
    return (
      <Link className="primary-link payment-return-action" href={status.retryQuizUrl}>
        חזרה לשאלון השמור
      </Link>
    );
  }

  if (status.state === "payment_pending" || status.state === "report_generating") {
    return <PaymentStatusPoller paymentId={paymentId} initialStatus={status} />;
  }

  return null;
}
