import { requireAuthenticatedUserId } from "@/app/api/matching/auth";
import { FunnelButton, FunnelCard, FunnelShell, IconList } from "@/components/funnel";
import { HeartHandshake, MapPin, ShieldCheck } from "lucide-react";
import { MatchingProfileForm } from "./matching-profile-form";

export const dynamic = "force-dynamic";

export default async function MatchingProfilePage() {
  const userId = await requireAuthenticatedUserId();

  if (!userId) {
    return (
      <FunnelShell>
        <FunnelCard>
          <h1>השלמת פרופיל התאמות</h1>
          <p>צריך להתחבר כדי להשלים את פרופיל ההתאמות.</p>
          <FunnelButton href="/login?next=%2Fprofile%2Fmatching">
            התחברות
          </FunnelButton>
        </FunnelCard>
      </FunnelShell>
    );
  }

  return (
    <FunnelShell className="funnel-shell--wide">
      <FunnelCard className="register-panel">
        <p className="funnel-eyebrow">שלב התאמות</p>
        <h1>פרופיל התאמה</h1>
        <p>הפרטים האלה משמשים לסינון התאמות בסיסי לפני שאלון העומק.</p>
        <IconList
          items={[
            { icon: MapPin, title: "מיקום וטווח גילאים" },
            { icon: ShieldCheck, title: "גבולות שלא מתפשרים עליהם" },
            { icon: HeartHandshake, title: "כוונת קשר והעדפות בסיסיות" },
          ]}
        />
        <MatchingProfileForm />
      </FunnelCard>
    </FunnelShell>
  );
}
