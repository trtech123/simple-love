"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; details?: unknown };

export function ProfileFormVersionActions(props: { versionId: string; status: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function runAction(action: "create-draft" | "publish" | "archive") {
    setError(null);
    setBusyAction(action);

    try {
      if (action === "create-draft") {
        const result = await readEnvelope<{ versionId: string }>(
          await fetch("/api/admin/profile-form-config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceVersionId: props.versionId }),
          }),
        );
        router.push(`/admin/profile-form/${result.versionId}`);
        router.refresh();
        return;
      }

      await readEnvelope(
        await fetch(`/api/admin/profile-form-config/${props.versionId}/${action}`, {
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
      <button
        className="secondary-button"
        type="button"
        disabled={busyAction !== null}
        onClick={() => void runAction("create-draft")}
      >
        יצירת טיוטה
      </button>
      {props.status === "draft" ? (
        <button
          className="secondary-button"
          type="button"
          disabled={busyAction !== null}
          onClick={() => void runAction("publish")}
        >
          פרסום
        </button>
      ) : null}
      {props.status !== "archived" ? (
        <button
          className="secondary-button"
          type="button"
          disabled={busyAction !== null}
          onClick={() => void runAction("archive")}
        >
          ארכוב
        </button>
      ) : null}
      {error ? <p className="inline-error">{error}</p> : null}
    </div>
  );
}

async function readEnvelope<T = unknown>(response: Response) {
  const data = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !data?.ok) {
    throw new Error(data && !data.ok ? data.message : "הבקשה נכשלה.");
  }
  return data.data;
}
