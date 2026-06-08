"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function RegisterClaimForm({
  claimToken,
  callbackError,
}: {
  claimToken: string;
  callbackError?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(callbackError ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  async function handleGoogleSignIn() {
    setError(null);
    setIsGoogleSubmitting(true);

    const redirectTo = new URL("/auth/callback", window.location.origin);
    redirectTo.searchParams.set("claim", claimToken);
    redirectTo.searchParams.set("next", "/app");

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo.toString(),
      },
    });

    if (signInError) {
      setError("לא הצלחנו להתחיל התחברות עם Google. נסי שוב.");
      setIsGoogleSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    const email = form.get("email")?.toString() ?? "";
    const password = form.get("password")?.toString() ?? "";

    const response = await fetch("/api/register/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claimToken,
        email,
        password,
        displayName: form.get("displayName"),
      }),
    });

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setError(localizeRegistrationError(payload?.error));
      setIsSubmitting(false);
      return;
    }

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError("החשבון נוצר. התחברי כדי להמשיך לפרופיל ההתאמות.");
      setIsSubmitting(false);
      return;
    }

    router.push("/app");
  }

  return (
    <div className="register-auth-column">
      <div className="register-google-block">
        <p className="register-auth-title">הדרך המהירה להיכנס</p>
        <button
          className="primary-button register-google-button"
          type="button"
          disabled={isGoogleSubmitting || isSubmitting}
          onClick={() => void handleGoogleSignIn()}
        >
          <span aria-hidden="true" className="google-mark">
            G
          </span>
          {isGoogleSubmitting ? "מעבירים ל-Google..." : "התחברות עם Google"}
        </button>
      </div>

      {error ? (
        <p className="form-error" role="alert" aria-live="polite">
          {error}
        </p>
      ) : null}

      <div className="register-divider" aria-hidden="true">
        <span />
      </div>

      <form className="register-form register-form--fallback" onSubmit={(event) => void handleSubmit(event)}>
        <input type="hidden" name="claim" value={claimToken} />

        <p className="register-auth-title">אפשר גם להירשם עם אימייל</p>

        <label>
          שם לתצוגה
          <input name="displayName" type="text" autoComplete="name" required />
        </label>

        <label>
          אימייל
          <input name="email" type="email" autoComplete="email" dir="ltr" required />
        </label>

        <label>
          סיסמה
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            dir="ltr"
            minLength={8}
            required
          />
        </label>

        <button className="secondary-button" type="submit" disabled={isSubmitting || isGoogleSubmitting}>
          {isSubmitting ? "יוצרים חשבון..." : "יצירת חשבון באימייל"}
        </button>
      </form>
    </div>
  );
}

function localizeRegistrationError(error?: string) {
  if (!error) {
    return "לא הצלחנו להשלים את ההרשמה. נסי שוב.";
  }

  if (/already|registered|exists|duplicate|email/i.test(error)) {
    return "האימייל הזה כבר רשום. התחברי עם Google או עם הסיסמה הקיימת.";
  }

  if (/expired/i.test(error)) {
    return "פג התוקף של קישור הדוח. צרי קשר ונעזור לחבר אותו לחשבון.";
  }

  if (/claim|not found/i.test(error)) {
    return "קישור הדוח לא תקין או שכבר אינו זמין.";
  }

  return "לא הצלחנו להשלים את ההרשמה. נסי שוב.";
}
