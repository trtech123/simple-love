import { createServiceRoleClient } from "@/lib/supabase/admin";
import Link from "next/link";
import {
  archiveArchetypeVersionAction,
  createArchetypeDraftVersionAction,
  publishArchetypeVersionAction,
} from "../actions/archetypes";
import { versionStatusLabel } from "../admin-copy";

export const dynamic = "force-dynamic";

export default async function AdminArchetypesPage() {
  const supabase = createServiceRoleClient();
  const { data: archetypes } = await supabase
    .from("archetype_versions")
    .select("id, version, status, name, published_at, archetypes(stable_key)")
    .order("created_at", { ascending: false })
    .returns<
      {
        id: string;
        version: number;
        status: string;
        name: string;
        published_at: string | null;
        archetypes: { stable_key: string } | null;
      }[]
    >();

  return (
    <main>
      <h1>ניהול ארכיטיפים</h1>
      <p>ניהול 12 הארכיטיפים הבסיסיים והמשמעויות המפורסמות שלהם לדוחות ולהתאמות.</p>
      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>מפתח</th>
              <th>שם</th>
              <th>גרסה</th>
              <th>סטטוס</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {(archetypes ?? []).length === 0 ? (
              <tr>
                <td colSpan={5}>אין רשומות להצגה</td>
              </tr>
            ) : (
              (archetypes ?? []).map((archetype) => (
            <tr key={archetype.id}>
              <td>{archetype.archetypes?.stable_key ?? ""}</td>
              <td>{archetype.name}</td>
              <td>{archetype.version}</td>
              <td>{versionStatusLabel(archetype.status)}</td>
              <td>
                <div className="admin-actions">
                  {archetype.status === "draft" ? (
                    <Link className="secondary-link" href={`/admin/archetypes/${archetype.id}`}>
                      עריכת טיוטה
                    </Link>
                  ) : (
                    <Link className="secondary-link" href={`/admin/archetypes/${archetype.id}`}>
                      צפייה
                    </Link>
                  )}
                  <form action={createArchetypeDraftVersionAction}>
                    <input type="hidden" name="versionId" value={archetype.id} />
                    <button className="secondary-button" type="submit">
                      יצירת טיוטה
                    </button>
                  </form>
                  {archetype.status === "draft" ? (
                    <form action={publishArchetypeVersionAction}>
                      <input type="hidden" name="versionId" value={archetype.id} />
                      <button className="secondary-button" type="submit">
                        פרסום
                      </button>
                    </form>
                  ) : null}
                  {archetype.status !== "archived" ? (
                    <form action={archiveArchetypeVersionAction}>
                      <input type="hidden" name="versionId" value={archetype.id} />
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
