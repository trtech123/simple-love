import { requireAuthenticatedUserId } from "@/app/api/matching/auth";
import { isE2eTestMode } from "@/lib/e2e-mode";
import { FileQuestion, HeartHandshake, Lock, MessagesSquare, UserRoundCheck } from "lucide-react";
import { FunnelButton, FunnelCard, FunnelShell, FunnelStateIcon, IconList, PriceSummary } from "@/components/funnel";
import { MatchChatButton } from "./match-chat-button";
import { MatchingUnlockButton } from "./matching-unlock-button";
import { loadMatchesPageData } from "./matches-loader";

export const dynamic = "force-dynamic";

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
      <FunnelShell>
        <FunnelCard>
          <FunnelStateIcon icon={UserRoundCheck} />
          <h1>ההתאמות שלך</h1>
          <p>כדי לפתוח התאמות צריך להשלים את פרופיל ההתאמה הבסיסי.</p>
          <FunnelButton href="/profile/matching">
            להשלים פרופיל התאמה
          </FunnelButton>
        </FunnelCard>
      </FunnelShell>
    );
  }

  if (!profile.completedDepthQuestionnaireAt) {
    return (
      <FunnelShell>
        <FunnelCard>
          <FunnelStateIcon icon={FileQuestion} />
          <h1>ההתאמות שלך</h1>
          <p>כדי לחשב התאמות מדויקות צריך להשלים את שאלון העומק.</p>
          <FunnelButton href="/matching/questionnaire">
            להשלים שאלון עומק
          </FunnelButton>
        </FunnelCard>
      </FunnelShell>
    );
  }

  if (!profile.hasMatchingEntitlement) {
    return (
      <FunnelShell>
        <FunnelCard>
          <FunnelStateIcon icon={HeartHandshake} />
          <p className="funnel-eyebrow">שלב בתשלום</p>
          <h1>פתיחת ההתאמות שלך</h1>
          <p>הדוח המלא כבר שולם. כדי לפתוח התאמות ושיחה, צריך לפתוח את שלב ההתאמות.</p>
          <PriceSummary title="פתיחת התאמות ושיחות" price="99 ש״ח" caption="תשלום חד פעמי לשלב ההתאמות." />
          <IconList items={[{ icon: MessagesSquare, title: "כולל פתיחת שיחה עם התאמות זמינות" }]} />
          <MatchingUnlockButton />
        </FunnelCard>
      </FunnelShell>
    );
  }

  return (
    <FunnelShell className="funnel-shell--wide">
      <FunnelCard className="matches-panel">
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
      </FunnelCard>
    </FunnelShell>
  );
}
