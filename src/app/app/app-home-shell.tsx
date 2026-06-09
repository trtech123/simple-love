"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, FileQuestion, HeartHandshake, Lock, MessageCircle, UserRound, WalletCards } from "lucide-react";
import { FunnelStateIcon } from "@/components/funnel";
import type { MatchesPageData } from "../matches/matches-loader";
import { MatchChatButton } from "../matches/match-chat-button";
import { MatchingUnlockButton } from "../matches/matching-unlock-button";
import { AiCoachPanel } from "./ai-coach-panel";

type AppTab = "coach" | "matches" | "profile";

export function AppHomeShell({ data }: { data: MatchesPageData }) {
  const [activeTab, setActiveTab] = useState<AppTab>("coach");
  const profile = data.profile;

  return (
    <main className="app-home-shell" dir="rtl">
      <section className="app-home-page" aria-label="LovLov app">
        <header className="app-home-topbar">
          <Link className="app-home-brand" href="/" dir="ltr">
            LOVLOV.ME
          </Link>
          <div className="app-home-avatar" aria-hidden="true">
            {profile?.displayName?.trim().charAt(0) || "L"}
          </div>
        </header>

        {activeTab === "coach" ? <CoachView data={data} /> : null}
        {activeTab === "matches" ? <MatchesView data={data} /> : null}
        {activeTab === "profile" ? <ProfileView data={data} /> : null}
      </section>

      <nav className="app-bottom-nav" aria-label="Primary app navigation">
        <NavButton active={activeTab === "coach"} icon={MessageCircle} label="AI coach" onClick={() => setActiveTab("coach")} />
        <NavButton
          active={activeTab === "matches"}
          icon={data.profile?.hasMatchingEntitlement ? HeartHandshake : Lock}
          label="Matches"
          onClick={() => setActiveTab("matches")}
        />
        <NavButton active={activeTab === "profile"} icon={UserRound} label="Profile" onClick={() => setActiveTab("profile")} />
      </nav>
    </main>
  );
}

function CoachView({ data }: { data: MatchesPageData }) {
  const profile = data.profile;

  return (
    <div className="app-view app-view--coach">
      <div className="app-home-intro">
        <h1>היי {profile?.displayName}</h1>
        <p>זה דף הבית שלך: מאמנת ה-AI, מצב ההתקדמות והצעדים הבאים לקראת התאמות.</p>
      </div>

      <div className="app-profile-glance" aria-label="Profile summary">
        <span>{profile?.locationText ?? "לא הוגדר מיקום"}</span>
        <span>{profile?.relationshipIntention ?? "לא הוגדרה כוונת קשר"}</span>
      </div>

      <section className="app-coach-hero" aria-labelledby="coach-title">
        <div className="app-coach-heading">
          <span className="app-coach-icon" aria-hidden="true">
            <Bot size={30} strokeWidth={2.1} />
          </span>
          <div>
            <h2 id="coach-title">מאמנת ה-AI שלך</h2>
            <p className="app-live-pill">
              <span aria-hidden="true" />
              זמינה לשיחה עכשיו
            </p>
          </div>
        </div>
        <AiCoachPanel />
      </section>

      <div className="app-mini-grid" aria-label="App progress">
        <article className="app-mini-card">
          <h3>הדוח האישי</h3>
          <p>התובנות הראשוניות מוכנות. אפשר להמשיך לדייק את הפרופיל והשאלון.</p>
          <span className="app-lock-pill">50% הושלם</span>
        </article>
        <article className="app-mini-card">
          <h3>התאמות</h3>
          <p>{matchStatusCopy(data)}</p>
          <span className="app-lock-pill">{profile?.hasMatchingEntitlement ? "פתוח" : "נעול"}</span>
        </article>
      </div>
    </div>
  );
}

function ProfileView({ data }: { data: MatchesPageData }) {
  const profile = data.profile;

  return (
    <section className="app-view" aria-labelledby="profile-title">
      <div className="app-home-intro">
        <h1 id="profile-title">הפרופיל שלי</h1>
        <p>הפרטים הבסיסיים שמשמשים לדייק את החוויה ואת ההתאמות.</p>
      </div>

      <div className="app-profile-card">
        <SummaryRow label="שם" value={profile?.displayName ?? "לא הוגדר"} />
        <SummaryRow label="מיקום" value={profile?.locationText ?? "לא הוגדר"} />
        <SummaryRow label="כוונת קשר" value={profile?.relationshipIntention ?? "לא הוגדרה"} />
        <SummaryRow
          label="סטטוס שאלון"
          value={profile?.completedDepthQuestionnaireAt ? "שאלון עומק הושלם" : "שאלון עומק פתוח"}
        />
      </div>

      <Link className="funnel-button funnel-button--primary app-full-button" href="/profile/matching">
        עדכון פרופיל
      </Link>
    </section>
  );
}

function MatchesView({ data }: { data: MatchesPageData }) {
  return (
    <section className="app-view" aria-labelledby="matches-title">
      <div className="app-home-intro">
        <h1 id="matches-title">התאמות</h1>
        <p>כאן יופיעו התאמות אמיתיות לפי שאלון העומק, הזכאות והסינון הקיים.</p>
      </div>
      <MatchesTabContent data={data} />
    </section>
  );
}

function MatchesTabContent({ data }: { data: MatchesPageData }) {
  const profile = data.profile;

  if (!profile?.completedDepthQuestionnaireAt) {
    return (
      <div className="empty-state-card app-match-state">
        <FunnelStateIcon icon={FileQuestion} />
        <h2>שאלון העומק עוד פתוח</h2>
        <p>כדי לחשב התאמות מדויקות צריך להשלים את שאלון העומק. השאלון לא חלק מהאונבורדינג הראשוני.</p>
        <Link className="funnel-button funnel-button--primary app-full-button" href="/matching/questionnaire">
          להשלים שאלון עומק
        </Link>
      </div>
    );
  }

  if (!profile.hasMatchingEntitlement) {
    return (
      <div className="empty-state-card app-match-state">
        <FunnelStateIcon icon={WalletCards} />
        <h2>Matches ready</h2>
        <p>ההתאמות מוכנות, אבל פתיחת שמות, תמונות וצ'אט זמינה רק אחרי פתיחת שלב ההתאמות.</p>
        <MatchingUnlockButton />
      </div>
    );
  }

  if (!data.matches.length) {
    return (
      <div className="empty-state-card app-match-state">
        <FunnelStateIcon icon={HeartHandshake} />
        <h2>עדיין אין התאמות זמינות</h2>
        <p>הן יופיעו כאן כשעוד משתמשים ישלימו את שאלון העומק.</p>
      </div>
    );
  }

  return (
    <div className="match-list app-match-list">
      {data.matches.map((match) => {
        const matchedProfile = match.otherProfile;

        return (
          <article className="match-card app-match-card" key={match.id}>
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

function NavButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof MessageCircle;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={active ? "app-nav-button app-nav-button--active" : "app-nav-button"}
      type="button"
      onClick={onClick}
    >
      <Icon size={19} strokeWidth={2.2} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-profile-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function matchStatusCopy(data: MatchesPageData) {
  if (!data.profile?.completedDepthQuestionnaireAt) {
    return "השלמת שאלון העומק תפתח את חישוב ההתאמות.";
  }

  if (!data.profile.hasMatchingEntitlement) {
    return "ההתאמות מחכות לפתיחת שלב ההתאמות.";
  }

  return data.matches.length ? `${data.matches.length} התאמות זמינות` : "אין התאמות פעילות כרגע.";
}
