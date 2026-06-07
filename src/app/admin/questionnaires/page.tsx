import { createServiceRoleClient } from "@/lib/supabase/admin";
import Link from "next/link";
import {
  archiveQuestionnaireVersionAction,
  createQuestionnaireDraftVersionAction,
  publishQuestionnaireVersionAction,
} from "../actions/questionnaires";
import { questionnairePurposeLabel, versionStatusLabel } from "../admin-copy";

export const dynamic = "force-dynamic";

export default async function AdminQuestionnairesPage() {
  const supabase = createServiceRoleClient();
  const { data: versions } = await supabase
    .from("questionnaire_versions")
    .select("id, version, status, published_at, questionnaires(title, slug, purpose)")
    .order("created_at", { ascending: false })
    .returns<
      {
        id: string;
        version: number;
        status: string;
        published_at: string | null;
        questionnaires: { title: string; slug: string; purpose: string } | null;
      }[]
    >();

  return (
    <main>
      <h1>ניהול שאלונים</h1>
      <p>יצירת טיוטות, פרסום גרסאות פעילות וארכוב גרסאות שאלון ישנות.</p>
      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>כותרת</th>
              <th>מזהה</th>
              <th>מטרה</th>
              <th>גרסה</th>
              <th>סטטוס</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {(versions ?? []).length === 0 ? (
              <tr>
                <td colSpan={6}>אין רשומות להצגה</td>
              </tr>
            ) : (
              (versions ?? []).map((version) => (
            <tr key={version.id}>
              <td>{version.questionnaires?.title ?? ""}</td>
              <td><code>{version.questionnaires?.slug ?? ""}</code></td>
              <td>{version.questionnaires ? questionnairePurposeLabel(version.questionnaires.purpose) : ""}</td>
              <td>{version.version}</td>
              <td>{versionStatusLabel(version.status)}</td>
              <td>
                <div className="admin-actions">
                  {version.status === "draft" ? (
                    <Link className="secondary-link" href={`/admin/questionnaires/${version.id}`}>
                      עריכת טיוטה
                    </Link>
                  ) : (
                    <Link className="secondary-link" href={`/admin/questionnaires/${version.id}`}>
                      צפייה
                    </Link>
                  )}
                  <form action={createQuestionnaireDraftVersionAction}>
                    <input type="hidden" name="versionId" value={version.id} />
                    <button className="secondary-button" type="submit">
                      יצירת טיוטה
                    </button>
                  </form>
                  {version.status === "draft" ? (
                    <form action={publishQuestionnaireVersionAction}>
                      <input type="hidden" name="versionId" value={version.id} />
                      <button className="secondary-button" type="submit">
                        פרסום
                      </button>
                    </form>
                  ) : null}
                  {version.status !== "archived" ? (
                    <form action={archiveQuestionnaireVersionAction}>
                      <input type="hidden" name="versionId" value={version.id} />
                      <button className="secondary-button" type="submit">
                        ארכוב
                      </button>
                    </form>
                  ) : null}
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
