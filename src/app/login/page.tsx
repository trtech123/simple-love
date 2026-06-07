import { DEFAULT_LOGIN_NEXT, normalizeNextPath } from "@/app/auth/next-path";
import { Mascot } from "@/components/brand/mascot";
import { Wordmark } from "@/components/brand/wordmark";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const rawError = Array.isArray(params.error) ? params.error[0] : params.error;
  const nextPath = normalizeNextPath(rawNext, DEFAULT_LOGIN_NEXT);

  return (
    <main className="page-shell register-page register-page--claim" dir="rtl">
      <section className="register-panel register-panel--claim" aria-labelledby="login-title">
        <div className="register-hero-copy">
          <div className="register-brand-row">
            <Mascot pose="wave" size={74} title="לב" />
            <Wordmark size={34} />
          </div>
          <p className="eyebrow">כניסה למשתמשים קיימים</p>
          <h1 id="login-title">ברוכה השבה</h1>
          <p>התחברי לחשבון שלך כדי להמשיך להתאמות, לצ'אט או לשלב הבא שהתחלת.</p>
          <ul className="register-benefits" aria-label="מה מחכה אחרי ההתחברות">
            <li>ההתאמות והצ'אטים נשמרים בחשבון האישי שלך.</li>
            <li>אם עדיין חסר שלב, נוביל אותך ישר אליו.</li>
            <li>דוח ששולם נשאר במסלול ההרשמה הייעודי שלו.</li>
          </ul>
        </div>

        <LoginForm nextPath={nextPath} callbackError={errorMessageForCode(rawError)} />
      </section>
    </main>
  );
}

function errorMessageForCode(error?: string) {
  switch (error) {
    case "missing_code":
    case "auth_failed":
      return "לא הצלחנו להשלים את ההתחברות עם Google. נסי שוב.";
    default:
      return null;
  }
}
