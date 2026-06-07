"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; details?: unknown };

export function MatchSettingsVersionActions(props: { versionId: string; status: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function runAction(action: "create-draft" | "publish" | "archive") {
    setError(null);
    setBusyAction(action);

    try {
      if (action === "create-draft") {
        const result = await readEnvelope<{ versionId: string }>(
          await fetch("/api/admin/matching/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceVersionId: props.versionId }),
          }),
        );
        router.push(`/admin/matching/${result.versionId}`);
        router.refresh();
        return;
      }

      await readEnvelope(
        await fetch(`/api/admin/matching/settings/${props.versionId}/${action}`, {
          method: "POST",
        }),
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "הפעולה נכשלה.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="admin-actions">
      <button className="secondary-button" type="button" disabled={busyAction !== null} onClick={() => void runAction("create-draft")}>
        יצירת טיוטה
      </button>
      {props.status === "draft" ? (
        <button className="secondary-button" type="button" disabled={busyAction !== null} onClick={() => void runAction("publish")}>
          פרסום
        </button>
      ) : null}
      {props.status !== "archived" ? (
        <button className="secondary-button" type="button" disabled={busyAction !== null} onClick={() => void runAction("archive")}>
          ארכוב
        </button>
      ) : null}
      {error ? <p className="inline-error">{error}</p> : null}
    </div>
  );
}

export function MatchingRerunControls() {
  const [userId, setUserId] = useState("");
  const [busyAction, setBusyAction] = useState<"user" | "global" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function rerun(scope: "user" | "global") {
    setMessage(null);
    setError(null);
    setBusyAction(scope);

    try {
      const result = await readEnvelope<{ recalculated: number; settingsVersionId: string }>(
        await fetch("/api/admin/matching/rerun", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(scope === "user" ? { scope, userId: userId.trim() } : { scope }),
        }),
      );
      setMessage(`חושבו ${result.recalculated} התאמות מחדש בגרסה ${result.settingsVersionId}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "חישוב ההתאמות נכשל.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="admin-editor-section" aria-label="חישוב התאמות מחדש">
      <h2>חישוב התאמות מחדש</h2>
      <div className="admin-editor-row">
        <label>
          מזהה משתמש
          <input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="מזהה משתמש" />
        </label>
        <button className="secondary-button" type="button" disabled={busyAction !== null || !userId.trim()} onClick={() => void rerun("user")}>
          חישוב מחדש למשתמש
        </button>
        <button className="primary-button" type="button" disabled={busyAction !== null} onClick={() => void rerun("global")}>
          חישוב מחדש לכל המשתמשים
        </button>
      </div>
      {message ? <p className="admin-editor-meta">{message}</p> : null}
      {error ? <p className="inline-error">{error}</p> : null}
    </section>
  );
}

async function readEnvelope<T = unknown>(response: Response) {
  const data = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !data?.ok) {
    throw new Error(data && !data.ok ? data.message : "הבקשה נכשלה.");
  }
  return data.data;
}
