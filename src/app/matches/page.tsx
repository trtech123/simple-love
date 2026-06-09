import { requireAuthenticatedUserId } from "@/app/api/matching/auth";
import { isE2eTestMode } from "@/lib/e2e-mode";
import { AppFrame } from "@/components/app/app-frame";
import { FileQuestion, HeartHandshake, Lock, MessagesSquare, UserRoundCheck } from "lucide-react";
import { FunnelButton, FunnelCard, FunnelShell, FunnelStateIcon, IconList, PriceSummary } from "@/components/funnel";
import { MatchChatButton } from "./match-chat-button";
import { MatchingUnlockButton } from "./matching-unlock-button";
import { loadMatchesPageData } from "./matches-loader";

export const dynamic = "force-dynamic";

const lockedPreviewCards = [
  { score: 92, meta: "כוונה זוגית דומה - אזור קרוב" },
  { score: 88, meta: "קצב תקשורת מתאים - ערכים קרובים" },
  { score: 84, meta: "פוטנציאל שיחה גבוה - התאמת אורח חיים" },
];

export default async function MatchesPage() {
  const userId = await requireAuthenticatedUserId();

  if (!userId) {
    return (
      <FunnelShell>
        <FunnelCard>
          <FunnelStateIcon icon={Lock} />
          <h1>ההתאמות שלך</h1>
          <p>צריך להתחבר כדי לראות את ההתאמות.</p>
          <FunnelButton href="/login?next=%2Fmatches">
            התחברות
          </FunnelButton>
        </FunnelCard>
      </FunnelShell>
    );
  }

  const { profile, matches } = await loadMatchesPageData(userId, { e2eMode: isE2eTestMode() });

  if (!profile?.matchingProfileComplete) {
    return (
      <FunnelShell className="funnel-shell--app" showBrand={false}>
        <AppFrame active="profile" avatarLabel={profile?.displayName}>
          <section className="app-view app-match-state">
            <FunnelStateIcon icon={UserRoundCheck} />
            <h1>ההתאמות שלך</h1>
            <p>כדי לפתוח התאמות צריך להשלים את פרופיל ההתאמה הבסיסי.</p>
            <FunnelButton href="/profile/matching">להשלים פרופיל התאמה</FunnelButton>
          </section>
        </AppFrame>
      </FunnelShell>
    );
  }

  if (!profile.completedDepthQuestionnaireAt) {
    return (
      <FunnelShell className="funnel-shell--app" showBrand={false}>
        <AppFrame active="questionnaire" avatarLabel={profile.displayName}>
          <section className="app-view app-match-state">
            <FunnelStateIcon icon={FileQuestion} />
            <h1>ההתאמות שלך</h1>
            <p>כדי לחשב התאמות מדויקות צריך להשלים את שאלון העומק.</p>
            <FunnelButton href="/matching/questionnaire">להשלים שאלון עומק</FunnelButton>
          </section>
        </AppFrame>
      </FunnelShell>
    );
  }

  if (!profile.hasMatchingEntitlement) {
    return (
      <FunnelShell className="funnel-shell--app" showBrand={false}>
        <AppFrame active="matches" avatarLabel={profile.displayName}>
          <section className="matches-panel matches-panel--locked app-view">
            <div className="locked-matches-header">
              <div>
                <p className="funnel-eyebrow">שלב בתשלום</p>
                <h1>ההתאמות שלך מוכנות</h1>
                <p>כדי לשמור על פרטיות, שמות, תמונות ופרטי התאמה נפתחים רק אחרי פתיחת שלב ההתאמות.</p>
              </div>
              <FunnelStateIcon icon={HeartHandshake} />
            </div>

            <div className="locked-matches-grid" aria-label="תצוגה מקדימה של התאמות נעולות">
              {lockedPreviewCards.map((preview) => (
                <article className="match-card match-card--locked" key={preview.score}>
                  <div>
                    <h2>התאמה נעולה</h2>
                    <p>{preview.meta}</p>
                  </div>
                  <strong>{preview.score}%</strong>
                  <div className="locked-preview-lines" aria-hidden="true">
                    <span>שם ותמונה ייפתחו אחרי התשלום</span>
                    <span>סיבת התאמה אישית תופיע כאן</span>
                  </div>
                </article>
              ))}
            </div>

            <div className="locked-unlock-panel">
              <PriceSummary title="פתיחת התאמות ושיחות" price="99 ש״ח" caption="תשלום חד פעמי לשלב ההתאמות." />
              <IconList items={[{ icon: MessagesSquare, title: "כולל פתיחת שיחה עם התאמות זמינות" }]} />
              <MatchingUnlockButton />
            </div>
          </section>
        </AppFrame>
      </FunnelShell>
    );
  }

  return (
    <FunnelShell className="funnel-shell--app" showBrand={false}>
      <AppFrame active="matches" avatarLabel={profile.displayName}>
        <section className="matches-panel app-view">
          <p className="funnel-eyebrow">התאמות פעילות</p>
          <h1>ההתאמות שלך</h1>
          {matches.length ? (
            <div className="match-list">
              {matches.map((match) => {
                const matchedProfile = match.otherProfile;

                return (
                  <article className="match-card" key={match.id}>
                    <div>
                      <h2>{matchedProfile?.displayName ?? "התאמה חדשה"}</h2>
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
          ) : (
            <div className="empty-state-card">
              <FunnelStateIcon icon={HeartHandshake} />
              <p>עדיין אין התאמות זמינות. הן יופיעו כאן כשעוד משתמשים ישלימו את שאלון העומק.</p>
            </div>
          )}
        </section>
      </AppFrame>
    </FunnelShell>
  );
}
