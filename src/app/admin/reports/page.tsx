import { createServiceRoleClient } from "@/lib/supabase/admin";
import { canRetryReport } from "@/domain/reports/retry";
import { retryReportAction } from "../actions/reports";
import { reportStatusLabel } from "../admin-copy";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const supabase = createServiceRoleClient();
  const { data: reports } = await supabase
    .from("reports")
    .select("id, report_number, status, error_message, prompt_version_id, created_at")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<
      {
        id: string;
        report_number: string;
        status: "pending" | "generating" | "completed" | "failed";
        error_message: string | null;
        prompt_version_id: string;
        created_at: string;
      }[]
    >();

  return (
    <main>
      <h1>ניהול דוחות</h1>
      <p>מעקב אחר מצב הפקה, תקלות וניסיונות חוזרים לדוחות בתשלום.</p>
      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>דוח</th>
              <th>סטטוס</th>
              <th>תקלה</th>
              <th>שחזור</th>
            </tr>
          </thead>
          <tbody>
            {(reports ?? []).length === 0 ? (
              <tr>
                <td colSpan={4}>אין רשומות להצגה</td>
              </tr>
            ) : (
              (reports ?? []).map((report) => (
            <tr key={report.id}>
              <td>{report.report_number}</td>
              <td>{reportStatusLabel(report.status)}</td>
              <td>{report.error_message ?? ""}</td>
              <td>
                {canRetryReport({ status: report.status }) ? (
                  <div className="admin-actions">
                    <form action={retryReportAction}>
                      <input type="hidden" name="reportId" value={report.id} />
                      <input type="hidden" name="mode" value="original" />
                      <button className="secondary-button" type="submit">
                        ניסיון חוזר עם המקור
                      </button>
                    </form>
                    <form action={retryReportAction}>
                      <input type="hidden" name="reportId" value={report.id} />
                      <input type="hidden" name="mode" value="latest" />
                      <button className="secondary-button" type="submit">
                        ניסיון חוזר עם העדכני
                      </button>
                    </form>
                  </div>
                ) : (
                  ""
                )}
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
