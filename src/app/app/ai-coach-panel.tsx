"use client";

import { useEffect, useState, type FormEvent } from "react";

const QUICK_PROMPTS = [
  { label: "מה הדפוס שלי?", value: "מה הדפוס הכי בולט שלי בקשרים לפי מה שסיפרתי לך?" },
  { label: "איך לשפר פרופיל?", value: "איך כדאי לדייק את הפרופיל שלי כדי למשוך קשר מתאים יותר?" },
  { label: "למה אני נתקע/ת?", value: "איפה יכול להיות שאני נתקע/ת בדייטים או בתחילת קשר?" },
  { label: "איזה קשר מתאים לי?", value: "איזה סוג קשר ואדם יכולים להתאים לי עכשיו?" },
];

type CoachMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
};

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; details?: unknown };

export function AiCoachPanel() {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadThread() {
      try {
        const data = await readJsonResponse<{ messages: CoachMessage[] }>(await fetch("/api/ai-coach/thread"));
        if (active) {
          setMessages(data.messages);
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "לא הצלחנו לטעון את שיחת ה-AI.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadThread();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;

    setError(null);
    setSubmitting(true);
    setMessage("");
    const optimisticId = `pending-${Date.now()}`;
    setMessages((current) => [...current, { id: optimisticId, role: "user", content: trimmed }]);

    try {
      const data = await readJsonResponse<{ messages: CoachMessage[] }>(
        await fetch("/api/ai-coach/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed }),
        }),
      );

      setMessages((current) => [...current.filter((item) => item.id !== optimisticId), ...data.messages]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "שליחת ההודעה נכשלה.");
      setMessages((current) => current.filter((item) => item.id !== optimisticId));
      setMessage(trimmed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ai-coach-box">
      <div className="ai-coach-thread" aria-live="polite">
        {loading ? (
          <p>טוענים שיחה...</p>
        ) : messages.length ? (
          messages.map((item, index) => (
            <article className={`ai-coach-message ai-coach-message--${item.role}`} key={item.id ?? `${item.role}-${index}`}>
              <span>{item.role === "assistant" ? "מאמנת" : "אני"}</span>
              <p>{item.content}</p>
            </article>
          ))
        ) : (
          <p>השיחה עוד ריקה.</p>
        )}
      </div>

      <div className="ai-coach-quick-prompts" aria-label="שאלות מהירות">
        {QUICK_PROMPTS.map((prompt, index) => (
          <button
            aria-label={index === 0 ? "פתיחת שיחה מהירה" : undefined}
            className="ai-coach-chip"
            key={prompt.label}
            type="button"
            onClick={() => setMessage(prompt.value)}
          >
            {prompt.label}
          </button>
        ))}
      </div>

      <form onSubmit={(event) => void handleSubmit(event)}>
        <label className="sr-only" htmlFor="ai-coach-message">
          הודעה למאמנת
        </label>
        <div className="ai-coach-input-row">
          <textarea
            aria-label="הודעה למאמנת"
            id="ai-coach-message"
            name="message"
            value={message}
            onChange={(event) => setMessage(event.currentTarget.value)}
            placeholder="כתבי הודעה למאמנת..."
            rows={1}
          />
          <button className="primary-button" type="submit" disabled={submitting || !message.trim()} aria-label="שליחת הודעה">
            {submitting ? "שולחים..." : "שליחה"}
          </button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
      </form>
    </div>
  );
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !data?.ok) {
    throw new Error(data && !data.ok ? data.message : "הבקשה נכשלה.");
  }

  return data.data;
}
