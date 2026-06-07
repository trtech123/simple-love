"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MatchChatButton({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openChat() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/matches/${matchId}/conversation`, {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "לא ניתן לפתוח את השיחה.");
      }

      router.push(`/chat/${payload.conversationId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "לא ניתן לפתוח את השיחה.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="match-actions">
      <button className="primary-button" type="button" onClick={openChat} disabled={isLoading}>
        {isLoading ? "פותחים..." : "שיחה"}
      </button>
      {error ? <p className="inline-error">{error}</p> : null}
    </div>
  );
}
