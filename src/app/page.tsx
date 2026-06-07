import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Brain,
  ClipboardCheck,
  FileText,
  Flag,
  Heart,
  Lock,
  Send,
  ShieldCheck,
  Tag,
  Target,
} from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";

const valueItems = [
  { icon: Heart, title: "דפוסי אהבה" },
  { icon: Flag, title: "דגלים אדומים" },
  { icon: Target, title: "מי באמת מתאים לך" },
  { icon: FileText, title: "דוח אישי ודיסקרטי" },
];

const steps = [
  {
    icon: ClipboardCheck,
    title: "עונים על שאלון קצר",
    text: "כמה דקות של תשובות כנות שמפתחות את הדרך להבנה עמוקה.",
  },
  {
    icon: FileText,
    title: "מקבלים דוח אישי",
    text: "ניתוח של דפוסי הזוגיות שלך ודפוסי האהבה שפועלים אצלך.",
  },
  {
    icon: Brain,
    title: "מכירים את עצמך טוב יותר",
    text: "דפוסים, חוזקות, חסמים והזדמנויות לצמיחה.",
  },
  {
    icon: Heart,
    title: "ממשיכים למסלול Simple",
    text: "פותחים התאמות אישיות וכלים שישאירו אותך לשאלון עמוק יותר.",
  },
];

export default function HomePage() {
  return (
    <main className="landing-page landing-page--reference">
      <header className="landing-header landing-header--reference" aria-label="LovLov">
        <Link className="landing-logo-block" href="/" aria-label="LOVLOV.ME">
          <Wordmark size={44} />
          <span>מבית Simple המחברת אותך לעצמך ולאחרים.</span>
        </Link>
        <Link className="landing-header-cta landing-header-cta--reference" href="/quiz">
          להתחיל / עכשיו
          <Heart size={18} fill="currentColor" aria-hidden="true" />
        </Link>
      </header>

      <section className="landing-hero landing-hero--reference" aria-labelledby="landing-title">
        <div className="landing-hero-copy landing-hero-copy--reference">
          <p className="landing-kicker landing-kicker--reference">שאלון אישי ודוח ממוקד</p>
          <h1 id="landing-title">
            מהי הסיבה
            <strong> האמיתית </strong>
            שלא מצאת זוגיות עד היום?
          </h1>
          <span className="landing-title-rule" aria-hidden="true" />
          <p className="landing-lede landing-lede--reference">
            אולי אתה לא מחפש את האדם הלא נכון. אולי אתה חוזר <strong>לאותו דפוס</strong> שוב ושוב.
          </p>

          <ul className="landing-value-row" aria-label="מה מקבלים">
            {valueItems.map((item) => {
              const Icon = item.icon;

              return (
                <li key={item.title}>
                  <Icon size={34} strokeWidth={1.8} aria-hidden="true" />
                  <span>{item.title}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="landing-visual landing-visual--reference" aria-label="זוג מחייך">
          <Image
            src="/landing-couple.png"
            alt="זוג מחייך יושב יחד באווירה חמה"
            width={1536}
            height={1024}
            priority
            sizes="(max-width: 860px) 100vw, 58vw"
            className="landing-couple-image landing-couple-image--reference"
          />
          <Heart className="landing-heart landing-heart--one" size={42} aria-hidden="true" />
          <Heart className="landing-heart landing-heart--two" size={34} aria-hidden="true" />
          <aside className="landing-report-card landing-report-card--reference" aria-label="פתיחת אבחון זוגיות">
            <Heart className="landing-report-heart" size={96} strokeWidth={1.4} aria-hidden="true" />
            <div className="landing-report-copy">
              <h2>צעד אחד קטן,</h2>
              <p>יכול לשנות את כל הסיפור שלך.</p>
              <strong>התחל/י את המסע להיכרות אמיתית. קודם כל עם עצמך.</strong>
            </div>
            <Link href="/quiz">
              התחל/י אבחון "הזהות הזוגית שלך"
              <ArrowLeft size={24} aria-hidden="true" />
            </Link>
            <div className="landing-report-meta">
              <span>
                <Tag size={18} aria-hidden="true" />
                <strong>99</strong> ש״ח בלבד
              </span>
              <span>
                <Lock size={18} aria-hidden="true" />
                דוח אישי ודיסקרטי
              </span>
              <span>
                <Send size={18} aria-hidden="true" />
                תוך מספר דקות למייל/וואטסאפ שלך
              </span>
            </div>
          </aside>
        </div>
      </section>

      <section className="landing-trust-strip landing-trust-strip--reference" aria-label="אבטחה ופרטיות">
        <ShieldCheck size={42} aria-hidden="true" />
        <p>
          אבחון אישי, דיסקרטי ומבוסס מדע.
          <strong> כדי שתוכל להבין את עצמך, ולבחור אחרת.</strong>
        </p>
      </section>

      <section className="landing-process landing-process--reference" aria-labelledby="landing-process-title">
        <div className="landing-section-heading landing-section-heading--center">
          <h2 id="landing-process-title">איך זה עובד?</h2>
          <Heart size={15} fill="currentColor" aria-hidden="true" />
        </div>

        <div className="landing-process-grid landing-process-grid--reference">
          {steps.map((step, index) => {
            const Icon = step.icon;

            return (
              <article className="landing-process-card landing-process-card--reference" key={step.title}>
                <span className="landing-step-number" aria-hidden="true">
                  {index + 1}
                </span>
                <Icon size={44} strokeWidth={1.7} aria-hidden="true" />
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <footer className="landing-footer landing-footer--reference">
        <Wordmark size={26} />
        <p>מבית Simple המחברת אותך לעצמך ולאחרים</p>
      </footer>
    </main>
  );
}
