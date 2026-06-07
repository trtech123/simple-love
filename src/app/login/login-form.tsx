"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function LoginForm({
  nextPath,
  callbackError,
}: {
  nextPath: string;
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
    redirectTo.searchParams.set("next", nextPath);

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

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(localizeSignInError(signInError.message));
      setIsSubmitting(false);
      return;
    }

    router.push(nextPath);
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
        <input type="hidden" name="next" value={nextPath} />

        <p className="register-auth-title">כניסה עם אימייל וסיסמה</p>

        <label>
          אימייל
          <input name="email" type="email" autoComplete="email" dir="ltr" required />
        </label>

        <label>
          סיסמה
          <input name="password" type="password" autoComplete="current-password" dir="ltr" required />
        </label>

        <button className="secondary-button" type="submit" disabled={isSubmitting || isGoogleSubmitting}>
          {isSubmitting ? "נכנסים..." : "כניסה עם אימייל"}
        </button>
      </form>
    </div>
  );
}

function localizeSignInError(error: string) {
  if (/invalid|credentials|password|email/i.test(error)) {
    return "האימייל או הסיסמה לא נכונים. בדקי את הפרטים ונסי שוב.";
  }

  return "לא הצלחנו להתחבר לחשבון. נסי שוב בעוד רגע.";
}
