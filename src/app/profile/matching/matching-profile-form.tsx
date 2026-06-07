"use client";

import type { PublicProfileFormConfigVersion } from "@/domain/matching/profile-form-config";
import { MVP_LOCATION_OPTIONS } from "@/domain/matching/locations";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

type MatchingProfilePayload = {
  complete: boolean;
  profile: {
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

export function MatchingProfileForm() {
  const router = useRouter();
  const [payload, setPayload] = useState<MatchingProfilePayload | null>(null);
  const [configVersion, setConfigVersion] = useState<PublicProfileFormConfigVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationKey, setLocationKey] = useState("custom");

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const [configData, profileData] = await Promise.all([
          readJsonResponse<PublicProfileFormConfigVersion>(await fetch("/api/profile/matching/config")),
          readJsonResponse<MatchingProfilePayload>(await fetch("/api/profile/matching")),
        ]);

        if (active) {
          setConfigVersion(configData);
          setPayload(profileData);
          setLocationKey(getLocationKeyForText(profileData.profile?.locationText) ?? "custom");
        }
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    const selectedLocation = MVP_LOCATION_OPTIONS.find((option) => option.key === form.get("locationKey"));
    const locationText = selectedLocation?.displayText ?? String(form.get("customLocationText") ?? "").trim();
    const dealBreakers = form
      .getAll("dealBreakers")
      .map((item) => item.toString())
      .filter(Boolean);

    try {
      await readJsonResponse(
        await fetch("/api/profile/matching", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            birthYear: Number(form.get("birthYear")),
            preferredAgeMin: Number(form.get("preferredAgeMin")),
            preferredAgeMax: Number(form.get("preferredAgeMax")),
            gender: form.get("gender"),
            interestedIn: form.get("interestedIn"),
            locationText,
            ...(selectedLocation
              ? {
                  locationCoordinates: {
                    latitude: selectedLocation.latitude,
                    longitude: selectedLocation.longitude,
                  },
                }
              : {}),
            preferredDistanceKm: Number(form.get("preferredDistanceKm")),
            relationshipIntention: form.get("relationshipIntention"),
            dealBreakers,
            otherDealBreakerText: form.get("otherDealBreakerText"),
          }),
        }),
      );

      router.push("/matching/questionnaire");
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

  if (!configVersion) {
    return error ? <p className="form-error">{error}</p> : null;
  }

  const config = configVersion.config;
  const profile = payload?.profile;
  const selectedDealBreakerKeys = new Set(
    (payload?.dealBreakers ?? []).map((item) => item.key ?? item.normalizedKey),
  );
  const otherDealBreakerText =
    (payload?.dealBreakers ?? []).find((item) => (item.key ?? item.normalizedKey) === "other")?.otherText ?? "";
  const selectedLocationText = profile?.locationText ?? "";
  const currentYear = new Date().getFullYear();

  return (
    <form className="register-form" onSubmit={(event) => void handleSubmit(event)}>
      <div className="register-grid">
        <label>
          שנת לידה
          <input
            name="birthYear"
            type="number"
            min={currentYear - config.birthYear.maxAge}
            max={currentYear - config.birthYear.minAge}
            inputMode="numeric"
            defaultValue={profile?.birthYear ?? ""}
            required
          />
        </label>

        <div className="profile-field-group">
          <label>
            מיקום
            <select
              name="locationKey"
              value={locationKey}
              onChange={(event) => setLocationKey(event.currentTarget.value)}
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

          {locationKey === "custom" ? (
            <label>
              עיר או יישוב
              <input
                name="customLocationText"
                type="text"
                autoComplete="address-level2"
                defaultValue={selectedLocationText}
                required
              />
            </label>
          ) : null}
        </div>

        <label>
          רדיוס מרחק בק"מ
          <input
            name="preferredDistanceKm"
            type="number"
            min={config.preferredDistanceKm.min}
            max={config.preferredDistanceKm.max}
            inputMode="numeric"
            defaultValue={profile?.preferredDistanceKm ?? config.preferredDistanceKm.default}
            required
          />
        </label>
      </div>

      <div className="register-grid">
        <label>
          גיל מינימלי
          <input
            name="preferredAgeMin"
            type="number"
            min={config.preferredAge.min}
            max={config.preferredAge.max}
            inputMode="numeric"
            defaultValue={profile?.preferredAgeMin ?? ""}
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
            defaultValue={profile?.preferredAgeMax ?? ""}
            required
          />
        </label>
      </div>

      <OptionFieldset name="gender" legend="מגדר" options={config.genderOptions} defaultValue={profile?.gender} />
      <OptionFieldset
        name="interestedIn"
        legend="מחפש/ת להכיר"
        options={config.interestedInOptions}
        defaultValue={profile?.interestedIn}
      />
      <OptionFieldset
        name="relationshipIntention"
        legend="כוונת קשר"
        options={config.relationshipIntentions}
        defaultValue={profile?.relationshipIntention}
      />

      <fieldset className="profile-fieldset">
        <legend>גבולות שלא מתפשרים עליהם</legend>
        <div className="profile-checkbox-grid">
          {config.dealBreakers.map((option) => (
            <label key={option.value} className="profile-checkbox">
              <input
                name="dealBreakers"
                type="checkbox"
                value={option.value}
                defaultChecked={selectedDealBreakerKeys.has(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <label>
          פירוט נוסף
          <textarea
            name="otherDealBreakerText"
            className="profile-textarea"
            defaultValue={otherDealBreakerText}
          />
        </label>
      </fieldset>

      {error ? <p className="form-error">{error}</p> : null}

      <button className="primary-button" type="submit" disabled={submitting}>
        {submitting ? "שומר..." : "שמירה והמשך"}
      </button>
    </form>
  );
}

function OptionFieldset(props: {
  name: string;
  legend: string;
  options: Array<{ value: string; label: string }>;
  defaultValue?: string | null;
}) {
  return (
    <fieldset className="profile-fieldset">
      <legend>{props.legend}</legend>
      <div className="profile-checkbox-grid">
        {props.options.map((option, index) => (
          <label key={option.value} className="profile-checkbox">
            <input
              name={props.name}
              type="radio"
              value={option.value}
              defaultChecked={props.defaultValue ? props.defaultValue === option.value : index === 0}
              required
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

async function readJsonResponse<T = unknown>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok || !data?.ok) {
    throw new Error(data && !data.ok ? data.message : "הבקשה נכשלה.");
  }

  return data.data;
}

function getLocationKeyForText(locationText: string | null | undefined) {
  const normalized = locationText?.trim().toLowerCase();
  if (!normalized) {
    return MVP_LOCATION_OPTIONS[0]?.key;
  }

  return MVP_LOCATION_OPTIONS.find((option) => option.displayText.toLowerCase() === normalized)?.key ?? null;
}
