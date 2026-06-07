import { createServiceRoleClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { versionStatusLabel } from "../admin-copy";
import { ProfileFormVersionActions } from "./profile-form-actions";

export const dynamic = "force-dynamic";

type VersionRow = {
  id: string;
  version: number;
  status: string;
  published_at: string | null;
  created_at: string;
  profile_form_configs: { slug: string } | null;
};

export default async function AdminProfileFormPage() {
  const supabase = createServiceRoleClient();
  const { data: versions } = await supabase
    .from("profile_form_config_versions")
    .select("id, version, status, published_at, created_at, profile_form_configs(slug)")
    .order("created_at", { ascending: false })
    .returns<VersionRow[]>();

  return (
    <main>
      <h1>פרופיל התאמות</h1>
      <p>ניהול הגרסאות שמגדירות את טופס פרופיל ההתאמות הציבורי.</p>
      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>טופס</th>
              <th>גרסה</th>
              <th>סטטוס</th>
              <th>פורסם</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {(versions ?? []).length === 0 ? (
              <tr>
                <td colSpan={5}>אין רשומות להצגה</td>
              </tr>
            ) : (
              (versions ?? []).map((version) => (
            <tr key={version.id}>
              <td>{version.profile_form_configs?.slug ?? "default"}</td>
              <td>{version.version}</td>
              <td>{versionStatusLabel(version.status)}</td>
              <td>{version.published_at ? new Date(version.published_at).toLocaleString("he-IL") : ""}</td>
              <td>
                <div className="admin-actions">
                  <Link className="secondary-link" href={`/admin/profile-form/${version.id}`}>
                    {version.status === "draft" ? "עריכה" : "צפייה"}
                  </Link>
                  <ProfileFormVersionActions versionId={version.id} status={version.status} />
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
