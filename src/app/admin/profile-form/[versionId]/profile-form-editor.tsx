"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; details?: unknown };

export function ProfileFormEditor(props: {
  versionId: string;
  version: number;
  status: string;
  config: unknown;
}) {
  const router = useRouter();
  const isDraft = props.status === "draft";
  const initialJson = useMemo(() => JSON.stringify(props.config, null, 2), [props.config]);
  const [json, setJson] = useState(initialJson);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveDraft() {
    setError(null);
    setMessage(null);
    setSaving(true);

    let config: unknown;
    try {
      config = JSON.parse(json);
    } catch {
      setError("ה-JSON אינו תקין.");
      setSaving(false);
      return;
    }

    try {
      await readEnvelope(
        await fetch(`/api/admin/profile-form-config/${props.versionId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config }),
        }),
      );
      setMessage("הטיוטה נשמרה.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "שמירת הטיוטה נכשלה.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-editor-section">
      <div className="admin-editor-header">
        <div>
          <h2>גרסה {props.version}</h2>
          <p className="admin-editor-meta">{props.status}</p>
        </div>
      </div>
      <label>
        הגדרת הטופס
        <textarea
          dir="ltr"
          spellCheck={false}
          value={json}
          readOnly={!isDraft}
          onChange={(event) => setJson(event.currentTarget.value)}
        />
      </label>
      {message ? <p className="empty-state">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {isDraft ? (
        <div className="admin-editor-actions">
          <button className="primary-button" type="button" disabled={saving} onClick={() => void saveDraft()}>
            {saving ? "שומר..." : "שמירת טיוטה"}
          </button>
        </div>
      ) : null}
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
