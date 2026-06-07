"use client";

import { useState } from "react";

export function MatchingUnlockButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productKey: "matching_unlock" }),
      });
      const payload = await response.json();

      if (!response.ok || typeof payload.redirectUrl !== "string") {
        throw new Error(payload.error ?? "לא ניתן להתחיל תשלום.");
      }

      window.location.assign(payload.redirectUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "לא ניתן להתחיל תשלום.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="match-actions">
      <button className="primary-button" type="button" onClick={startCheckout} disabled={isLoading}>
        {isLoading ? "פותחים תשלום..." : "פתיחת התאמות - 99 ש״ח"}
      </button>
      {error ? <p className="inline-error">{error}</p> : null}
    </div>
  );
}
