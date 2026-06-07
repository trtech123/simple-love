import { createServiceRoleClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { archivePromptVersionAction, createPromptDraftVersionAction, publishPromptVersionAction } from "../actions/prompts";
import { versionStatusLabel } from "../admin-copy";

export const dynamic = "force-dynamic";

export default async function AdminPromptsPage() {
  const supabase = createServiceRoleClient();
  const { data: prompts } = await supabase
    .from("prompt_versions")
    .select("id, slug, version, status, model, published_at")
    .order("created_at", { ascending: false })
    .returns<{ id: string; slug: string; version: number; status: string; model: string; published_at: string | null }[]>();

  return (
    <main>
      <h1>ניהול פרומפטים</h1>
      <p>עריכת תבניות AI כטיוטות ופרסום גרסה פעילה אחת להפקת דוחות ציבורית.</p>
      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>מזהה</th>
              <th>גרסה</th>
              <th>סטטוס</th>
              <th>מודל</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {(prompts ?? []).length === 0 ? (
              <tr>
                <td colSpan={5}>אין רשומות להצגה</td>
              </tr>
            ) : (
              (prompts ?? []).map((prompt) => (
            <tr key={prompt.id}>
              <td>{prompt.slug}</td>
              <td>{prompt.version}</td>
              <td>{versionStatusLabel(prompt.status)}</td>
              <td>{prompt.model}</td>
              <td>
                <div className="admin-actions">
                  {prompt.status === "draft" ? (
                    <Link className="secondary-link" href={`/admin/prompts/${prompt.id}`}>
                      עריכת טיוטה
                    </Link>
                  ) : (
                    <Link className="secondary-link" href={`/admin/prompts/${prompt.id}`}>
                      צפייה
                    </Link>
                  )}
                  <form action={createPromptDraftVersionAction}>
                    <input type="hidden" name="versionId" value={prompt.id} />
                    <button className="secondary-button" type="submit">
                      יצירת טיוטה
                    </button>
                  </form>
                  {prompt.status === "draft" ? (
                    <form action={publishPromptVersionAction}>
                      <input type="hidden" name="versionId" value={prompt.id} />
                      <button className="secondary-button" type="submit">
                        פרסום
                      </button>
                    </form>
                  ) : null}
                  {prompt.status !== "archived" ? (
                    <form action={archivePromptVersionAction}>
                      <input type="hidden" name="versionId" value={prompt.id} />
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
