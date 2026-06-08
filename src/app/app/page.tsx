import { requireAuthenticatedUserId } from "@/app/api/matching/auth";
import { FunnelButton, FunnelCard, FunnelShell, FunnelStateIcon } from "@/components/funnel";
import { isE2eTestMode } from "@/lib/e2e-mode";
import { Bot, FileQuestion, HeartHandshake, Lock } from "lucide-react";
import { MatchChatButton } from "../matches/match-chat-button";
import { MatchingUnlockButton } from "../matches/matching-unlock-button";
import { loadMatchesPageData, type MatchesPageData } from "../matches/matches-loader";
import { MatchingProfileForm } from "../profile/matching/matching-profile-form";
import { AiCoachPanel } from "./ai-coach-panel";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const userId = await requireAuthenticatedUserId();

  if (!userId) {
    return (
      <FunnelShell>
        <FunnelCard>
          <FunnelStateIcon icon={Lock} />
          <h1>המרחב האישי שלך</h1>
          <p>צריך להתחבר כדי להמשיך לפרופיל, למאמנת ה-AI ולהתאמות.</p>
          <FunnelButton href="/login?next=%2Fapp">התחברות</FunnelButton>
        </FunnelCard>
      </FunnelShell>
    );
  }

  const data = await loadMatchesPageData(userId, { e2eMode: isE2eTestMode() });

  if (!data.profile?.matchingProfileComplete) {
    return (
      <FunnelShell className="funnel-shell--wide">
        <FunnelCard className="register-panel app-onboarding-panel">
          <p className="funnel-eyebrow">השלמת פרופיל</p>
          <h1>נשלים קודם את הפרטים הבסיסיים</h1>
          <p>השאלון העמוק נשאר אופציונלי לשלב ההתאמות. כאן צריך רק את פרטי הסינון הבסיסיים.</p>
          <MatchingProfileForm afterSavePath="/app" />
        </FunnelCard>
      </FunnelShell>
    );
  }

  return (
    <FunnelShell className="funnel-shell--wide">
      <main className="app-shell" dir="rtl">
        <header className="app-header">
          <div>
            <p className="funnel-eyebrow">המרחב האישי</p>
            <h1>שלום {data.profile.displayName}</h1>
          </div>
        </header>

        <nav className="app-tab-nav" aria-label="ניווט במרחב האישי">
          <a href="#profile">הפרופיל שלי</a>
          <a href="#coach">מאמנת AI</a>
          <a href="#matches">התאמות</a>
        </nav>

        <section id="profile" className="app-tab-panel" aria-labelledby="profile-tab-title">
          <h2 id="profile-tab-title">הפרופיל שלי</h2>
          <div className="profile-summary-grid">
            <SummaryItem label="מיקום" value={data.profile.locationText ?? "לא הוגדר"} />
            <SummaryItem label="כוונת קשר" value={data.profile.relationshipIntention ?? "לא הוגדרה"} />
          </div>
          <FunnelButton href="/profile/matching">עדכון פרופיל</FunnelButton>
        </section>

        <section id="coach" className="app-tab-panel" aria-labelledby="coach-tab-title">
          <div className="app-panel-heading">
            <FunnelStateIcon icon={Bot} />
            <div>
              <h2 id="coach-tab-title">מאמנת AI</h2>
              <p>כתבי מה חשוב לך בקשר. המאמן יעדכן אותות התאמה רכים ויציע שינויי סינון לאישור.</p>
            </div>
          </div>
          <AiCoachPanel />
        </section>

        <section id="matches" className="app-tab-panel" aria-labelledby="matches-tab-title">
          <h2 id="matches-tab-title">התאמות</h2>
          <MatchesTabContent data={data} />
        </section>
      </main>
    </FunnelShell>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile-summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MatchesTabContent({ data }: { data: MatchesPageData }) {
  const profile = data.profile;

  if (!profile?.completedDepthQuestionnaireAt) {
    return (
      <div className="empty-state-card">
        <FunnelStateIcon icon={FileQuestion} />
        <p>כדי לחשב התאמות מדויקות צריך להשלים את שאלון העומק. הטאב נשאר פתוח, והשאלון לא חלק מהאונבורדינג.</p>
        <FunnelButton href="/matching/questionnaire">להשלים שאלון עומק</FunnelButton>
      </div>
    );
  }

  if (!profile.hasMatchingEntitlement) {
    return (
      <div className="empty-state-card">
        <FunnelStateIcon icon={HeartHandshake} />
        <p>ההתאמות מוכנות, אבל פתיחת שמות, תמונות וצ'אט זמינה רק אחרי פתיחת שלב ההתאמות.</p>
        <MatchingUnlockButton />
      </div>
    );
  }

  if (!data.matches.length) {
    return (
      <div className="empty-state-card">
        <FunnelStateIcon icon={HeartHandshake} />
        <p>עדיין אין התאמות זמינות. הן יופיעו כאן כשעוד משתמשים ישלימו את שאלון העומק.</p>
      </div>
    );
  }

  return (
    <div className="match-list">
      {data.matches.map((match) => {
        const matchedProfile = match.otherProfile;

        return (
          <article className="match-card" key={match.id}>
            <div>
              <h3>{matchedProfile?.displayName ?? "התאמה חדשה"}</h3>
              <p>
                {[matchedProfile?.relationshipIntention, matchedProfile?.locationText].filter(Boolean).join(" - ") ||
                  "פרטים נוספים יופיעו בהמשך"}
              </p>
            </div>
            <strong>{Math.round(Number(match.score))}%</strong>
            <p className="match-copy">
              {match.explanationReasons?.[0] ??
                match.explanationSummary ??
                "התאמה גבוהה לפי עומק רגשי, תקשורת, מוכנות למחויבות וחזון זוגי."}
            </p>
            <MatchChatButton matchId={match.id} />
          </article>
        );
      })}
    </div>
  );
}
