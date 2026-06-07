import Link from "next/link";
import Image from "next/image";
import { Download, HeartHandshake, Mail, MessageCircle, UserPlus } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { FunnelButton } from "@/components/funnel";
import { getReportByClaimToken } from "@/domain/reports/claim-lookup";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const report = await getReportByClaimToken(token).catch(() => null);

  if (!report) {
    return (
      <main className="page-shell" dir="rtl">
        <h1>הדוח אינו זמין</h1>
        <p>הקישור לדוח חסר, פג תוקף, כבר נוצל, או שהדוח עדיין לא מוכן.</p>
      </main>
    );
  }

  const textSections = [
    { title: "הארכיטיפ שלך", body: report.output.archetypeExplanation },
    { title: "דפוס רגשי בקשר", body: report.output.emotionalRelationshipPattern },
  ];
  const listSections = [
    { title: "חוזקות", items: report.output.strengths },
    { title: "חסמים", items: report.output.blockers },
    { title: "צרכים בקשר", items: report.output.relationshipNeeds },
    { title: "הכוונה לדייטינג", items: report.output.datingGuidance },
    { title: "הכוונה להתאמות", items: report.output.matchingGuidance },
    { title: "תוכנית פעולה ל-7 ימים", items: report.output.sevenDayActionPlan },
    { title: "שאלות לרפלקציה", items: report.output.reflectionQuestions },
  ];

  return (
    <main className="page-shell report-page" dir="rtl">
      <article className="report-panel">
        <header className="report-cover">
          <div className="report-cover-brand">
            <Wordmark />
          </div>
          <p className="funnel-eyebrow">הדוח האישי שלך מוכן</p>
          <p className="report-number" dir="ltr">
            {report.reportNumber}
          </p>
          <h1>{report.output.title}</h1>
          <p className="report-summary">{report.output.openingSummary}</p>
        </header>

        <div className="report-section-stack">
          {textSections.map((section, index) => (
            <TextSection key={section.title} number={index + 1} title={section.title} body={section.body} />
          ))}
          {listSections.map((section, index) => (
            <ListSection
              key={section.title}
              number={textSections.length + index + 1}
              title={section.title}
              items={section.items}
            />
          ))}
        </div>

        <footer className="report-footer">
          <p className="report-disclaimer">{report.output.disclaimer}</p>
          <div className="report-actions">
            <Link className="secondary-link" href={`/api/reports/${encodeURIComponent(token)}/pdf`}>
              <Download size={17} aria-hidden="true" />
              הורדת PDF
            </Link>
            {report.canRegister ? (
              <Link className="primary-link" href={`/register?claim=${encodeURIComponent(token)}`}>
                <UserPlus size={17} aria-hidden="true" />
                הרשמה ושמירת הדוח
              </Link>
            ) : null}
          </div>
          <aside className="report-next-panel" aria-labelledby="report-next-title">
            <Image
              src="/landing-couple.png"
              alt="זוג יושב יחד באווירה רגועה"
              width={1536}
              height={1024}
              sizes="(max-width: 760px) 100vw, 320px"
              className="report-next-image"
            />
            <div className="report-next-copy">
              <p className="funnel-eyebrow">השלב הבא</p>
              <h2 id="report-next-title">להפוך את התובנה להתאמות</h2>
              <p>אחרי שמירת הדוח אפשר להשלים פרופיל התאמות, לענות על שאלון עומק, ולפתוח התאמות רלוונטיות.</p>
              <div className="funnel-actions">
                <FunnelButton href="/profile/matching">
                  <HeartHandshake size={17} aria-hidden="true" />
                  המשך להתאמות
                </FunnelButton>
                <Link className="secondary-link" href="mailto:hello@lovlov.me">
                  <Mail size={17} aria-hidden="true" />
                  אימייל
                </Link>
                <Link className="secondary-link" href="https://wa.me/?text=%D7%94%D7%99%D7%99%20LovLov%2C%20%D7%90%D7%A9%D7%9E%D7%97%20%D7%9C%D7%A2%D7%96%D7%A8%D7%94" target="_blank" rel="noreferrer">
                  <MessageCircle size={17} aria-hidden="true" />
                  WhatsApp
                </Link>
              </div>
            </div>
          </aside>
        </footer>
      </article>
    </main>
  );
}

function TextSection({ number, title, body }: { number: number; title: string; body: string }) {
  return (
    <section className="report-section">
      <SectionHeading number={number} title={title} />
      <p>{body}</p>
    </section>
  );
}

function ListSection({ number, title, items }: { number: number; title: string; items: string[] }) {
  return (
    <section className="report-section">
      <SectionHeading number={number} title={title} />
      <ol className="report-insight-list">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>
            <span className="report-insight-index" aria-hidden="true">
              {index + 1}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SectionHeading({ number, title }: { number: number; title: string }) {
  return (
    <div className="report-section-heading">
      <span className="report-section-number" dir="ltr">
        {String(number).padStart(2, "0")}
      </span>
      <h2>{title}</h2>
    </div>
  );
}
