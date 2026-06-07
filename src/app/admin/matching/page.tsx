import { createServiceRoleClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { versionStatusLabel } from "../admin-copy";
import { MatchSettingsVersionActions, MatchingRerunControls } from "./matching-actions";

export const dynamic = "force-dynamic";

type MatchSettingsVersion = {
  id: string;
  version: number;
  status: string;
  published_at: string | null;
  weights: Record<string, number>;
  hard_filters: string[];
  deal_breaker_filters?: string[];
  match_settings: { slug: string } | null;
};

export default async function AdminMatchingPage() {
  const supabase = createServiceRoleClient();
  const { data: versions } = await supabase
    .from("match_settings_versions")
    .select("id, version, status, published_at, weights, hard_filters, deal_breaker_filters, match_settings(slug)")
    .order("created_at", { ascending: false })
    .returns<MatchSettingsVersion[]>();
  const publishedVersion = (versions ?? []).find((version) => version.status === "published");

  return (
    <main className="admin-editor">
      <div className="admin-editor-header">
        <div>
          <h1>הגדרות התאמה</h1>
          <p>משקלים, פילטרים קשיחים, דיל-ברייקרים וחישוב התאמות מחדש.</p>
        </div>
      </div>

      <section className="admin-editor-section">
        <h2>גרסה מפורסמת</h2>
        <p className="admin-editor-meta">
          {publishedVersion
            ? `${publishedVersion.id} · גרסה ${publishedVersion.version} · ${
                publishedVersion.published_at ? new Date(publishedVersion.published_at).toLocaleString("he-IL") : ""
              }`
            : "אין גרסת הגדרות התאמה מפורסמת."}
        </p>
      </section>

      <MatchingRerunControls />

      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>סט</th>
              <th>גרסה</th>
              <th>סטטוס</th>
              <th>משקלים</th>
              <th>פילטרים</th>
              <th>דיל-ברייקרים</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {(versions ?? []).length === 0 ? (
              <tr>
                <td colSpan={7}>אין רשומות להצגה</td>
              </tr>
            ) : (
              (versions ?? []).map((version) => (
            <tr key={version.id}>
              <td>{version.match_settings?.slug ?? "default"}</td>
              <td>{version.version}</td>
              <td>{versionStatusLabel(version.status)}</td>
              <td>{Object.keys(version.weights ?? {}).length}</td>
              <td>{(version.hard_filters ?? []).length}</td>
              <td>{(version.deal_breaker_filters ?? []).length}</td>
              <td>
                <div className="admin-actions">
                  <Link className="secondary-link" href={`/admin/matching/${version.id}`}>
                    {version.status === "draft" ? "עריכה" : "צפייה"}
                  </Link>
                  <MatchSettingsVersionActions versionId={version.id} status={version.status} />
                </div>
              </td>
            </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
