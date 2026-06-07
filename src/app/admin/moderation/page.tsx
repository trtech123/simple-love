import { createServiceRoleClient } from "@/lib/supabase/admin";
import { disableModerationConversationAction, disableModerationUserAction } from "../actions/moderation";

export const dynamic = "force-dynamic";

type ReportRow = {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  conversation_id: string | null;
  reason: string;
  status?: string | null;
  created_at: string;
};

type ConversationRow = {
  id: string;
  status: "active" | "blocked" | "disabled";
  updated_at: string | null;
};

type ProfileRow = {
  user_id: string;
  display_name: string;
  disabled_at: string | null;
};

export default async function AdminModerationPage() {
  const supabase = createServiceRoleClient();
  const { data: reports } = await supabase
    .from("user_reports")
    .select("id, reporter_id, reported_user_id, conversation_id, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<ReportRow[]>();

  const conversationIds = unique((reports ?? []).map((report) => report.conversation_id).filter((id): id is string => Boolean(id)));
  const userIds = unique((reports ?? []).flatMap((report) => [report.reporter_id, report.reported_user_id]));
  const conversations = await loadConversations(conversationIds);
  const profiles = await loadProfiles(userIds);

  return (
    <main>
      <h1>מודרציה</h1>
      <p>ניהול דיווחים, חסימות ושיחות מושבתות.</p>
      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>דיווח</th>
              <th>מדווח</th>
              <th>משתמש מדווח</th>
              <th>שיחה</th>
              <th>סיבה</th>
              <th>תאריך</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {(reports ?? []).length === 0 ? (
              <tr>
                <td colSpan={7}>אין דיווחים להצגה</td>
              </tr>
            ) : (
              (reports ?? []).map((report) => {
                const conversation = report.conversation_id ? conversations.get(report.conversation_id) : null;
                const reporter = profiles.get(report.reporter_id);
                const reported = profiles.get(report.reported_user_id);

                return (
                  <tr key={report.id}>
                    <td>
                      <code>{report.id}</code>
                      <br />
                      {report.status ?? "open"}
                    </td>
                    <td>{profileLabel(report.reporter_id, reporter)}</td>
                    <td>{profileLabel(report.reported_user_id, reported)}</td>
                    <td>
                      {report.conversation_id ? (
                        <>
                          <code>{report.conversation_id}</code>
                          <br />
                          {conversation?.status ?? "unknown"}
                        </>
                      ) : (
                        "ללא שיחה"
                      )}
                    </td>
                    <td>{report.reason}</td>
                    <td>{formatDate(report.created_at)}</td>
                    <td>
                      <div className="admin-actions">
                        {report.conversation_id ? (
                          <a
                            className="secondary-link"
                            href={`/api/admin/moderation/conversations/${report.conversation_id}/messages?reportId=${report.id}`}
                          >
                            סקירת הודעות
                          </a>
                        ) : null}
                        {report.conversation_id && conversation?.status !== "disabled" ? (
                          <form action={disableModerationConversationAction}>
                            <input type="hidden" name="conversationId" value={report.conversation_id} />
                            <button className="secondary-button" type="submit">
                              השבתת שיחה
                            </button>
                          </form>
                        ) : null}
                        {reported?.disabled_at ? null : (
                          <form action={disableModerationUserAction}>
                            <input type="hidden" name="userId" value={report.reported_user_id} />
                            <button className="secondary-button danger-button" type="submit">
                              השבתת משתמש
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

async function loadConversations(ids: string[]) {
  const rows = new Map<string, ConversationRow>();
  if (!ids.length) return rows;

  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("conversations")
    .select("id, status, updated_at")
    .in("id", ids)
    .returns<ConversationRow[]>();
  for (const row of data ?? []) {
    rows.set(row.id, row);
  }
  return rows;
}

async function loadProfiles(ids: string[]) {
  const rows = new Map<string, ProfileRow>();
  if (!ids.length) return rows;

  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("profiles")
    .select("user_id, display_name, disabled_at")
    .in("user_id", ids)
    .returns<ProfileRow[]>();
  for (const row of data ?? []) {
    rows.set(row.user_id, row);
  }
  return rows;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function profileLabel(userId: string, profile?: ProfileRow) {
  return (
    <>
      {profile?.display_name ?? "משתמש"}
      {profile?.disabled_at ? " (מושבת)" : ""}
      <br />
      <code>{userId}</code>
    </>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
