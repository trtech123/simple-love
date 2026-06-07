import { createServiceRoleClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MatchSettingsEditor } from "./match-settings-editor";

export const dynamic = "force-dynamic";

type MatchSettingsVersion = {
  id: string;
  version: number;
  status: string;
  weights: Record<string, number>;
  hard_filters: string[];
  deal_breaker_filters?: string[];
  match_settings: { slug: string } | null;
};

export default async function AdminMatchSettingsEditorPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const supabase = createServiceRoleClient();
  const { data: settings } = await supabase
    .from("match_settings_versions")
    .select("id, version, status, weights, hard_filters, deal_breaker_filters, match_settings(slug)")
    .eq("id", versionId)
    .maybeSingle<MatchSettingsVersion>();

  if (!settings) {
    notFound();
  }

  return (
    <main className="admin-editor">
      <div className="admin-editor-header">
        <div>
          <h1>עריכת הגדרות התאמה</h1>
          <p className="admin-editor-meta">
            {settings.match_settings?.slug ?? "default"} · גרסה {settings.version} · {settings.status}
          </p>
        </div>
        <Link className="secondary-link" href="/admin/matching">
          חזרה
        </Link>
      </div>
      <MatchSettingsEditor
        versionId={settings.id}
        status={settings.status}
        weights={settings.weights ?? {}}
        hardFilters={settings.hard_filters ?? []}
        dealBreakerFilters={settings.deal_breaker_filters ?? []}
      />
    </main>
  );
}
