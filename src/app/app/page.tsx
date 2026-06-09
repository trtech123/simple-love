import { requireAuthenticatedUserId } from "@/app/api/matching/auth";
import { FunnelButton, FunnelCard, FunnelShell, FunnelStateIcon } from "@/components/funnel";
import { isE2eTestMode } from "@/lib/e2e-mode";
import { Lock } from "lucide-react";
import { loadMatchesPageData } from "../matches/matches-loader";
import { MatchingProfileForm } from "../profile/matching/matching-profile-form";
import { AppHomeShell } from "./app-home-shell";

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
    <FunnelShell className="funnel-shell--app">
      <AppHomeShell data={data} />
    </FunnelShell>
  );
}
