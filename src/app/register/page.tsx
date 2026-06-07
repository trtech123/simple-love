import { Wordmark } from "@/components/brand/wordmark";
import { FunnelCard, FunnelShell, IconList } from "@/components/funnel";
import { FileText, HeartHandshake, Lock } from "lucide-react";
import { RegisterClaimForm } from "./register-claim-form";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ claim?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const claim = Array.isArray(params.claim) ? params.claim[0] : params.claim;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  return (
    <FunnelShell className="funnel-shell--wide" topSlot={<Wordmark size={26} className="funnel-brand-link" />}>
      <FunnelCard className="register-panel register-panel--claim" aria-labelledby="register-title">
        <div className="register-hero-copy">
          <p className="funnel-eyebrow">שמירת הדוח ששולם</p>
          <h1 id="register-title">יצירת חשבון אחרי התשלום</h1>
          <p>חברי את הדוח לחשבון אישי כדי לחזור אליו בכל זמן ולהמשיך לשלב ההתאמות.</p>
          <IconList
            items={[
              { icon: FileText, title: "הדוח נשמר באזור האישי" },
              { icon: Lock, title: "קישור הדוח מתחבר רק לחשבון שלך" },
              { icon: HeartHandshake, title: "אפשר להמשיך לפרופיל ההתאמות" },
            ]}
          />
        </div>

        {claim ? (
          <RegisterClaimForm claimToken={claim} callbackError={errorMessageForCode(error)} />
        ) : (
          <div className="register-auth-column" role="status">
            <p className="form-error">נדרש קישור לדוח ששולם כדי לפתוח חשבון מהעמוד הזה.</p>
          </div>
        )}
      </FunnelCard>
    </FunnelShell>
  );
}

function errorMessageForCode(error?: string) {
  switch (error) {
    case "missing_code":
    case "auth_failed":
      return "לא הצלחנו להשלים את ההתחברות עם Google. נסי שוב.";
    case "missing_claim":
    case "invalid_claim":
      return "קישור הדוח לא תקין או שפג תוקפו.";
    case "expired_claim":
      return "פג התוקף של קישור הדוח. צרי קשר ונעזור לחבר אותו לחשבון.";
    case "already_claimed":
      return "הקישור הזה כבר חובר לחשבון אחר.";
    case "claim_failed":
      return "לא הצלחנו לחבר את הדוח לחשבון. נסי שוב בעוד רגע.";
    default:
      return null;
  }
}
