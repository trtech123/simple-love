import { Clock, FileText, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { FunnelButton, FunnelCard, FunnelShell, IconList, PriceSummary } from "@/components/funnel";

const benefits = [
  { icon: FileText, title: "דוח אישי בעברית", text: "תובנה מרכזית, דפוסים חוזרים והכוונה מעשית." },
  { icon: Sparkles, title: "שאלון קצר וממוקד", text: "כמה דקות על בחירות, קשרים והדרך שבה את מתקרבת." },
  { icon: Clock, title: "תוצאה שממשיכה איתך", text: "אפשר לשמור את הדוח ולהמשיך לפרופיל ההתאמות." },
];

export default function HomePage() {
  return (
    <FunnelShell className="funnel-shell--intro">
      <FunnelCard className="intro-card" aria-labelledby="landing-title">
        <div className="intro-card__hero">
          <p className="funnel-eyebrow">שאלון אישי ודוח ממוקד</p>
          <h1 id="landing-title">מהי הסיבה האמיתית שלא מצאת זוגיות עד היום?</h1>
          <p className="funnel-lede">
            עונים על שאלון אישי, מקבלים דוח שמסדר את הדפוסים שחוזרים בקשרים, וממשיכים עם מילים ברורות יותר לבחירה הבאה.
          </p>
        </div>

        <PriceSummary title="דוח LovLov מלא" price="99 ש״ח" caption="תשלום חד פעמי לפני פתיחת הדוח." />

        <div className="funnel-divider" />

        <section aria-labelledby="benefits-title" className="funnel-section">
          <h2 id="benefits-title">מה תקבלי?</h2>
          <IconList items={benefits} />
        </section>

        <div className="trust-row" aria-label="פרטיות ואבטחה">
          <span>
            <Lock size={16} aria-hidden="true" />
            תשלום מאובטח
          </span>
          <span>
            <ShieldCheck size={16} aria-hidden="true" />
            דיסקרטי ופרטי
          </span>
        </div>

        <FunnelButton href="/quiz">התחלת השאלון</FunnelButton>
      </FunnelCard>
    </FunnelShell>
  );
}
