import { CreditCard, Lock, ShieldCheck } from "lucide-react";
import { FunnelButton, FunnelCard, FunnelShell, IconList, PriceSummary } from "@/components/funnel";

export default async function MockPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string; session?: string }>;
}) {
  const { payment, session } = await searchParams;
  const paymentId = payment ?? session ?? "mock-token";
  const finalizeHref = `/payment/return?payment=${encodeURIComponent(paymentId)}&mockPayment=paid`;

  return (
    <FunnelShell>
      <FunnelCard aria-labelledby="mock-payment-title">
        <p className="funnel-eyebrow">תשלום מאובטח</p>
        <h1 id="mock-payment-title">פתיחת הדוח האישי</h1>
        <p className="funnel-lede">
          זהו מסך תשלום מדומה לסביבת פיתוח ובדיקות. בסביבת ייצור התשלום מתבצע בעמוד CHING חיצוני.
        </p>

        <PriceSummary title="דוח LovLov מלא" price="99 ש״ח" caption="התשובות כבר נשמרו, הדוח ייפתח אחרי אישור התשלום." />

        <IconList
          items={[
            { icon: Lock, title: "פרטי התשלום לא נשמרים אצל LovLov" },
            { icon: ShieldCheck, title: "החזרה לדוח מתבצעת רק אחרי אישור" },
            { icon: CreditCard, title: "מסך זה מיועד להרצה מקומית" },
          ]}
        />

        <p className="session-token" dir="ltr">
          {paymentId}
        </p>
        <FunnelButton href={finalizeHref}>אישור תשלום מדומה</FunnelButton>
      </FunnelCard>
    </FunnelShell>
  );
}
