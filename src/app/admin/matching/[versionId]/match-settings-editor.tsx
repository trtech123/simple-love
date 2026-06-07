"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const TRAIT_FIELDS = [
  ["emotional_profile", "פרופיל רגשי"],
  ["communication_style", "סגנון תקשורת"],
  ["commitment_readiness", "מוכנות למחויבות"],
  ["relationship_vision", "חזון זוגי"],
  ["visual_taste", "טעם ויזואלי"],
] as const;

const HARD_FILTER_FIELDS = [
  ["gender", "מגדר והעדפה"],
  ["age_range", "טווח גילאים הדדי"],
  ["distance", "מרחק הדדי"],
  ["relationship_intention", "כוונת קשר"],
  ["deal_breakers", "דיל-ברייקרים"],
] as const;

const DEAL_BREAKER_FIELDS = [
  ["smoking", "עישון"],
  ["wants_children_mismatch", "פער ברצון לילדים"],
  ["religion_values_mismatch", "פער דתי או ערכי"],
  ["political_values_mismatch", "פער פוליטי או ערכי"],
  ["pets_mismatch", "פער בנושא חיות מחמד"],
  ["substance_use", "שימוש בחומרים"],
  ["financial_instability", "אי יציבות כלכלית"],
  ["long_distance", "מרחק גדול"],
] as const;

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; details?: unknown };

export function MatchSettingsEditor(props: {
  versionId: string;
  status: string;
  weights: Record<string, number>;
  hardFilters: string[];
  dealBreakerFilters: string[];
}) {
  const router = useRouter();
  const isDraft = props.status === "draft";
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(TRAIT_FIELDS.map(([key]) => [key, Number(props.weights[key] ?? 0)])),
  );
  const [hardFilters, setHardFilters] = useState<string[]>(props.hardFilters ?? []);
  const [dealBreakerFilters, setDealBreakerFilters] = useState<string[]>(props.dealBreakerFilters ?? []);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const normalized = useMemo(() => {
    const active = Object.entries(weights).filter(([, value]) => value > 0);
    const total = active.reduce((sum, [, value]) => sum + value, 0);
    if (total <= 0) return {};
    return Object.fromEntries(active.map(([key, value]) => [key, Math.round((value / total) * 100)]));
  }, [weights]);

  async function saveDraft() {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      await readEnvelope(
        await fetch(`/api/admin/matching/settings/${props.versionId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weights, hardFilters, dealBreakerFilters }),
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
          <h2>הגדרות מנוע התאמה</h2>
          <p className="admin-editor-meta">{isDraft ? "טיוטה ניתנת לעריכה" : "גרסה מפורסמת או בארכיון לקריאה בלבד"}</p>
        </div>
        {isDraft ? (
          <button className="primary-button" type="button" disabled={saving} onClick={() => void saveDraft()}>
            שמירת טיוטה
          </button>
        ) : null}
      </div>

      <div className="admin-editor-section">
        <h3>משקלים</h3>
        {TRAIT_FIELDS.map(([key, label]) => (
          <label className="admin-editor-field" key={key}>
            {label}
            <input
              type="number"
              min="0"
              max="100"
              value={weights[key] ?? 0}
              readOnly={!isDraft}
              onChange={(event) => setWeights({ ...weights, [key]: Number(event.target.value) })}
            />
          </label>
        ))}
        <p className="admin-editor-meta">תצוגה מנורמלת: {JSON.stringify(normalized)}</p>
      </div>

      <div className="admin-editor-section">
        <h3>פילטרים קשיחים</h3>
        {HARD_FILTER_FIELDS.map(([key, label]) => (
          <label className="admin-editor-field" key={key}>
            <input
              type="checkbox"
              checked={hardFilters.includes(key)}
              disabled={!isDraft}
              onChange={(event) => setToggle(hardFilters, key, event.target.checked, setHardFilters)}
            />
            {label}
          </label>
        ))}
      </div>

      <div className="admin-editor-section">
        <h3>דיל-ברייקרים שמשתתפים בסינון</h3>
        {DEAL_BREAKER_FIELDS.map(([key, label]) => (
          <label className="admin-editor-field" key={key}>
            <input
              type="checkbox"
              checked={dealBreakerFilters.includes(key)}
              disabled={!isDraft}
              onChange={(event) => setToggle(dealBreakerFilters, key, event.target.checked, setDealBreakerFilters)}
            />
            {label}
          </label>
        ))}
      </div>

      {message ? <p className="admin-editor-meta">{message}</p> : null}
      {error ? <p className="inline-error">{error}</p> : null}
    </section>
  );
}

function setToggle(values: string[], key: string, checked: boolean, setValues: (values: string[]) => void) {
  setValues(checked ? [...new Set([...values, key])] : values.filter((value) => value !== key));
}

async function readEnvelope<T = unknown>(response: Response) {
  const data = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !data?.ok) {
    throw new Error(data && !data.ok ? data.message : "הבקשה נכשלה.");
  }
  return data.data;
}
