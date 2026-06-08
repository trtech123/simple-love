"use client";

import type { PublicProfileFormConfigVersion } from "@/domain/matching/profile-form-config";
import { MVP_LOCATION_OPTIONS } from "@/domain/matching/locations";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

type MatchingProfilePayload = {
  complete: boolean;
  profile: {
    displayName: string | null;
    birthYear: number | null;
    preferredAgeMin: number | null;
    preferredAgeMax: number | null;
    gender: string | null;
    interestedIn: string | null;
    locationText: string | null;
    preferredDistanceKm: number | null;
    relationshipIntention: string | null;
  } | null;
  dealBreakers: Array<{ label: string; key?: string; normalizedKey: string; otherText?: string | null }>;
};

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; details?: unknown };

type WizardValues = {
  displayName: string;
  birthYear: string;
  locationKey: string;
  customLocationText: string;
  preferredDistanceKm: string;
  preferredAgeMin: string;
  preferredAgeMax: string;
  gender: string;
  interestedIn: string;
  relationshipIntention: string;
  dealBreakers: string[];
  otherDealBreakerText: string;
};

export function MatchingProfileForm({ afterSavePath = "/app" }: { afterSavePath?: string }) {
  const router = useRouter();
  const [configVersion, setConfigVersion] = useState<PublicProfileFormConfigVersion | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<WizardValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const [configData, profileData] = await Promise.all([
          readJsonResponse<PublicProfileFormConfigVersion>(await fetch("/api/profile/matching/config")),
          readJsonResponse<MatchingProfilePayload>(await fetch("/api/profile/matching")),
        ]);

        if (!active) return;
        setConfigVersion(configData);
        setValues(createInitialValues(profileData, configData));
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "לא הצלחנו לטעון את הפרופיל.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, []);

  const steps = useMemo(() => {
    if (!configVersion || !values) return [];
    const wizardValues = values;
    const config = configVersion.config;
    const currentYear = new Date().getFullYear();

    return [
      {
        key: "displayName",
        title: "איך לקרוא לך?",
        body: (
          <label>
            שם לתצוגה
            <input
              name="displayName"
              type="text"
              autoComplete="name"
              value={values.displayName}
              onChange={(event) => updateValue("displayName", event.currentTarget.value)}
              required
            />
          </label>
        ),
        valid: values.displayName.trim().length > 0,
      },
      {
        key: "birthYear",
        title: "מה שנת הלידה שלך?",
        body: (
          <label>
            שנת לידה
            <input
              name="birthYear"
              type="number"
              min={currentYear - config.birthYear.maxAge}
              max={currentYear - config.birthYear.minAge}
              inputMode="numeric"
              value={values.birthYear}
              onChange={(event) => updateValue("birthYear", event.currentTarget.value)}
              required
            />
          </label>
        ),
        valid: Boolean(values.birthYear),
      },
      {
        key: "location",
        title: "איפה נוח לך להכיר?",
        body: (
          <div className="profile-step-stack">
            <label>
              מיקום
              <select
                name="locationKey"
                value={values.locationKey}
                onChange={(event) => updateValue("locationKey", event.currentTarget.value)}
                required
              >
                {MVP_LOCATION_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.displayText}
                  </option>
                ))}
                <option value="custom">מיקום אחר</option>
              </select>
            </label>
            {values.locationKey === "custom" ? (
              <label>
                עיר או יישוב
                <input
                  name="customLocationText"
                  type="text"
                  autoComplete="address-level2"
                  value={values.customLocationText}
                  onChange={(event) => updateValue("customLocationText", event.currentTarget.value)}
                  required
                />
              </label>
            ) : null}
          </div>
        ),
        valid: values.locationKey !== "custom" || values.customLocationText.trim().length > 0,
      },
      {
        key: "distance",
        title: "מה הרדיוס שנוח לך?",
        body: (
          <label>
            רדיוס מרחק בק"מ
            <input
              name="preferredDistanceKm"
              type="number"
              min={config.preferredDistanceKm.min}
              max={config.preferredDistanceKm.max}
              inputMode="numeric"
              value={values.preferredDistanceKm}
              onChange={(event) => updateValue("preferredDistanceKm", event.currentTarget.value)}
              required
            />
          </label>
        ),
        valid: Boolean(values.preferredDistanceKm),
      },
      {
        key: "preferredAge",
        title: "איזה טווח גילאים מתאים לך?",
        body: (
          <div className="profile-step-grid">
            <label>
              גיל מינימלי
              <input
                name="preferredAgeMin"
                type="number"
                min={config.preferredAge.min}
                max={config.preferredAge.max}
                inputMode="numeric"
                value={values.preferredAgeMin}
                onChange={(event) => updateValue("preferredAgeMin", event.currentTarget.value)}
                required
              />
            </label>
            <label>
              גיל מקסימלי
              <input
                name="preferredAgeMax"
                type="number"
                min={config.preferredAge.min}
                max={config.preferredAge.max}
                inputMode="numeric"
                value={values.preferredAgeMax}
                onChange={(event) => updateValue("preferredAgeMax", event.currentTarget.value)}
                required
              />
            </label>
          </div>
        ),
        valid: Boolean(values.preferredAgeMin && values.preferredAgeMax),
      },
      optionStep("gender", "מה המגדר שלך?", config.genderOptions),
      optionStep("interestedIn", "את מי תרצי להכיר?", config.interestedInOptions),
      optionStep("relationshipIntention", "איזו כוונת קשר מתאימה לך?", config.relationshipIntentions),
      {
        key: "dealBreakers",
        title: "מה לא מתאים לך בקשר?",
        body: (
          <fieldset className="profile-fieldset profile-fieldset--compact">
            <legend>גבולות שלא מתפשרים עליהם</legend>
            <div className="profile-checkbox-grid">
              {config.dealBreakers.map((option) => (
                <label key={option.value} className="profile-checkbox">
                  <input
                    name="dealBreakers"
                    type="checkbox"
                    value={option.value}
                    checked={values.dealBreakers.includes(option.value)}
                    onChange={(event) => toggleDealBreaker(option.value, event.currentTarget.checked)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ),
        valid: values.dealBreakers.length > 0,
      },
      ...(values.dealBreakers.includes("other")
        ? [
            {
              key: "otherDealBreakerText",
              title: "מה חשוב להוסיף?",
              body: (
                <label>
                  פירוט נוסף
                  <textarea
                    name="otherDealBreakerText"
                    className="profile-textarea"
                    value={values.otherDealBreakerText}
                    onChange={(event) => updateValue("otherDealBreakerText", event.currentTarget.value)}
                  />
                </label>
              ),
              valid: values.otherDealBreakerText.trim().length > 0,
            },
          ]
        : []),
    ];

    function optionStep(
      key: "gender" | "interestedIn" | "relationshipIntention",
      title: string,
      options: Array<{ value: string; label: string }>,
    ) {
      return {
        key,
        title,
        body: (
          <fieldset className="profile-fieldset profile-fieldset--compact">
            <legend>{title}</legend>
            <div className="profile-checkbox-grid">
              {options.map((option) => (
                <label key={option.value} className="profile-checkbox">
                  <input
                    name={key}
                    type="radio"
                    value={option.value}
                    checked={wizardValues[key] === option.value}
                    onChange={() => updateValue(key, option.value)}
                    required
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ),
        valid: Boolean(wizardValues[key]),
      };
    }
  }, [configVersion, values]);

  function updateValue<TKey extends keyof WizardValues>(key: TKey, value: WizardValues[TKey]) {
    setValues((current) => (current ? { ...current, [key]: value } : current));
  }

  function toggleDealBreaker(value: string, checked: boolean) {
    setValues((current) => {
      if (!current) return current;
      const next = checked
        ? [...new Set([...current.dealBreakers, value])]
        : current.dealBreakers.filter((item) => item !== value);
      return { ...current, dealBreakers: next };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const currentStep = steps[stepIndex];
    if (!currentStep?.valid) {
      setError("צריך להשלים את השאלה לפני שממשיכים.");
      return;
    }

    if (stepIndex < steps.length - 1) {
      setStepIndex((current) => current + 1);
      return;
    }

    if (!values) return;
    setSubmitting(true);

    const selectedLocation = MVP_LOCATION_OPTIONS.find((option) => option.key === values.locationKey);
    const locationText = selectedLocation?.displayText ?? values.customLocationText.trim();

    try {
      await readJsonResponse(
        await fetch("/api/profile/matching", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: values.displayName,
            birthYear: Number(values.birthYear),
            preferredAgeMin: Number(values.preferredAgeMin),
            preferredAgeMax: Number(values.preferredAgeMax),
            gender: values.gender,
            interestedIn: values.interestedIn,
            locationText,
            ...(selectedLocation
              ? {
                  locationCoordinates: {
                    latitude: selectedLocation.latitude,
                    longitude: selectedLocation.longitude,
                  },
                }
              : {}),
            preferredDistanceKm: Number(values.preferredDistanceKm),
            relationshipIntention: values.relationshipIntention,
            dealBreakers: values.dealBreakers,
            otherDealBreakerText: values.otherDealBreakerText,
          }),
        }),
      );

      router.push(afterSavePath);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "שמירת הפרופיל נכשלה.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="quiz-panel--loading" aria-live="polite">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line skeleton-line--short" />
      </div>
    );
  }

  if (!configVersion || !values || !steps.length) {
    return error ? <p className="form-error">{error}</p> : null;
  }

  const currentStep = steps[Math.min(stepIndex, steps.length - 1)];
  const progress = `${Math.min(stepIndex + 1, steps.length)} / ${steps.length}`;

  return (
    <form className="register-form profile-onboarding" onSubmit={(event) => void handleSubmit(event)}>
      <div className="profile-onboarding-header">
        <p className="funnel-eyebrow">{progress}</p>
        <h2>{currentStep.title}</h2>
      </div>

      {currentStep.body}

      {error ? <p className="form-error">{error}</p> : null}

      <div className="profile-onboarding-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={stepIndex === 0 || submitting}
          onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
        >
          חזרה
        </button>
        <button className="primary-button" type="submit" disabled={submitting}>
          {submitting ? "שומרים..." : stepIndex === steps.length - 1 ? "שמירה וסיום" : "המשך"}
        </button>
      </div>
    </form>
  );
}

async function readJsonResponse<T = unknown>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok || !data?.ok) {
    throw new Error(data && !data.ok ? data.message : "הבקשה נכשלה.");
  }

  return data.data;
}

function createInitialValues(
  payload: MatchingProfilePayload,
  configVersion: PublicProfileFormConfigVersion,
): WizardValues {
  const profile = payload.profile;
  const selectedLocationText = profile?.locationText ?? "";
  const locationKey = getLocationKeyForText(selectedLocationText) ?? "custom";
  const selectedDealBreakerKeys = (payload.dealBreakers ?? []).map((item) => item.key ?? item.normalizedKey);

  return {
    displayName: profile?.displayName ?? "",
    birthYear: profile?.birthYear?.toString() ?? "",
    locationKey,
    customLocationText: locationKey === "custom" ? selectedLocationText : "",
    preferredDistanceKm: (profile?.preferredDistanceKm ?? configVersion.config.preferredDistanceKm.default).toString(),
    preferredAgeMin: profile?.preferredAgeMin?.toString() ?? "",
    preferredAgeMax: profile?.preferredAgeMax?.toString() ?? "",
    gender: profile?.gender ?? configVersion.config.genderOptions[0]?.value ?? "",
    interestedIn: profile?.interestedIn ?? configVersion.config.interestedInOptions[0]?.value ?? "",
    relationshipIntention: profile?.relationshipIntention ?? configVersion.config.relationshipIntentions[0]?.value ?? "",
    dealBreakers: selectedDealBreakerKeys,
    otherDealBreakerText:
      (payload.dealBreakers ?? []).find((item) => (item.key ?? item.normalizedKey) === "other")?.otherText ?? "",
  };
}

function getLocationKeyForText(locationText: string | null | undefined) {
  const normalized = locationText?.trim().toLowerCase();
  if (!normalized) {
    return MVP_LOCATION_OPTIONS[0]?.key;
  }

  return MVP_LOCATION_OPTIONS.find((option) => option.displayText.toLowerCase() === normalized)?.key ?? null;
}
