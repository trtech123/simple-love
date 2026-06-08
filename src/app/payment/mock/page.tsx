import { CreditCard, Lock, ShieldCheck } from "lucide-react";
import { Lovi } from "@/components/brand/mascot";
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
    <FunnelShell className="funnel-shell--wide">
      <FunnelCard className="mock-payment-layout" aria-labelledby="mock-payment-title">
        <div className="mock-payment-copy">
          <div className="funnel-brand-lockup">
            <Lovi size={32} halo={false} wings={false} />
            <span dir="ltr">
              Lov<b>Lov</b>
            </span>
          </div>
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
        </div>

        <div className="mock-payment-form" aria-label="פרטי תשלום מדומים">
          <span className="mock-payment-flag">מצב בדיקה · ללא חיוב אמיתי</span>
          <label>
            <span>אימייל לקבלה</span>
            <input defaultValue="you@example.com" />
          </label>
          <label>
            <span>מספר כרטיס</span>
            <input defaultValue="4242 4242 4242 4242" inputMode="numeric" />
          </label>
          <div className="mock-payment-fields">
            <label>
              <span>תוקף</span>
              <input defaultValue="04 / 28" />
            </label>
            <label>
              <span>CVC</span>
              <input defaultValue="123" inputMode="numeric" />
            </label>
          </div>
          <p className="session-token" dir="ltr">
            {paymentId}
          </p>
          <FunnelButton href={finalizeHref}>אישור תשלום מדומה</FunnelButton>
          <p className="mock-payment-secure">מאובטח ומוצפן · שער תשלום מדומה</p>
        </div>
      </FunnelCard>
    </FunnelShell>
  );
}
