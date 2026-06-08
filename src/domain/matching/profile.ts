import {
  canonicalizeDealBreakerSubmission,
  type CanonicalDealBreaker,
} from "./deal-breakers";

export type MatchingLocationCoordinates = {
  latitude: number;
  longitude: number;
};

export type MatchingProfileInput = {
  displayName: string;
  birthYear: number;
  preferredAgeMin: number;
  preferredAgeMax: number;
  gender: string;
  interestedIn: string;
  locationText: string;
  locationCoordinates?: MatchingLocationCoordinates;
  preferredDistanceKm?: number;
  relationshipIntention: string;
  dealBreakers: string[];
  otherDealBreakerText?: string;
};

export type MatchingProfileDealBreaker = CanonicalDealBreaker;

export type MatchingProfileValue = Omit<MatchingProfileInput, "dealBreakers"> & {
  dealBreakers: MatchingProfileDealBreaker[];
};

export type MatchingProfileCompletionFields = {
  displayName?: string | null;
  birthYear?: number | null;
  preferredAgeMin?: number | null;
  preferredAgeMax?: number | null;
  gender?: string | null;
  interestedIn?: string | null;
  locationText?: string | null;
  preferredDistanceKm?: number | null;
  relationshipIntention?: string | null;
  dealBreakerKeys?: string[] | null;
};

export type MatchingProfileValidationResult =
  | { ok: true; value: MatchingProfileValue }
  | { ok: false; errors: MatchingProfileValidationCode[] };

export type MatchingProfileValidationCode =
  | "profile_required"
  | "display_name_required"
  | "display_name_too_long"
  | "birth_year_invalid"
  | "preferred_age_min_invalid"
  | "preferred_age_max_invalid"
  | "preferred_age_range_invalid"
  | "gender_required"
  | "gender_too_long"
  | "interested_in_required"
  | "interested_in_too_long"
  | "location_text_required"
  | "location_text_too_long"
  | "location_coordinates_invalid"
  | "preferred_distance_invalid"
  | "relationship_intention_required"
  | "relationship_intention_too_long"
  | "deal_breakers_required";

const MIN_AGE = 18;
const MAX_AGE = 120;
export const DEFAULT_PREFERRED_DISTANCE_KM = 50;
export const MIN_PREFERRED_DISTANCE_KM = 1;
export const MAX_PREFERRED_DISTANCE_KM = 500;

export function validateMatchingProfileInput(input: unknown): MatchingProfileValidationResult {
  if (!input || typeof input !== "object") {
    return { ok: false, errors: ["profile_required"] };
  }

  const record = input as Record<string, unknown>;
  const errors: MatchingProfileValidationCode[] = [];
  const currentYear = new Date().getFullYear();
  const birthYear = readInteger(record.birthYear);
  const displayName = readDisplayName(record.displayName, errors);
  const preferredAgeMin = readInteger(record.preferredAgeMin);
  const preferredAgeMax = readInteger(record.preferredAgeMax);
  const gender = readRequiredText(record.gender, "gender", errors, 80);
  const interestedIn = readRequiredText(record.interestedIn, "interestedIn", errors, 80);
  const locationText = readRequiredText(record.locationText, "locationText", errors, 160);
  const locationCoordinates = readLocationCoordinates(record.locationCoordinates, errors);
  const preferredDistanceKm =
    record.preferredDistanceKm === undefined || record.preferredDistanceKm === null
      ? DEFAULT_PREFERRED_DISTANCE_KM
      : readInteger(record.preferredDistanceKm);
  const relationshipIntention = readRequiredText(
    record.relationshipIntention,
    "relationshipIntention",
    errors,
    160,
  );

  if (birthYear === null || birthYear < currentYear - MAX_AGE || birthYear > currentYear - MIN_AGE) {
    errors.push("birth_year_invalid");
  }

  if (preferredAgeMin === null || preferredAgeMin < MIN_AGE || preferredAgeMin > MAX_AGE) {
    errors.push("preferred_age_min_invalid");
  }

  if (preferredAgeMax === null || preferredAgeMax < MIN_AGE || preferredAgeMax > MAX_AGE) {
    errors.push("preferred_age_max_invalid");
  }

  if (preferredAgeMin !== null && preferredAgeMax !== null && preferredAgeMin > preferredAgeMax) {
    errors.push("preferred_age_range_invalid");
  }

  if (
    preferredDistanceKm === null ||
    preferredDistanceKm < MIN_PREFERRED_DISTANCE_KM ||
    preferredDistanceKm > MAX_PREFERRED_DISTANCE_KM
  ) {
    errors.push("preferred_distance_invalid");
  }

  const dealBreakers = canonicalizeDealBreakerSubmission({
    dealBreakers: record.dealBreakers,
    otherDealBreakerText: record.otherDealBreakerText,
  });

  if (!dealBreakers.length) {
    errors.push("deal_breakers_required");
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      birthYear: birthYear as number,
      displayName,
      preferredAgeMin: preferredAgeMin as number,
      preferredAgeMax: preferredAgeMax as number,
      gender,
      interestedIn,
      locationText,
      ...(locationCoordinates ? { locationCoordinates } : {}),
      preferredDistanceKm: preferredDistanceKm as number,
      relationshipIntention,
      dealBreakers,
    },
  };
}

export function isMatchingProfileComplete(profile: MatchingProfileCompletionFields | null | undefined) {
  if (!profile) {
    return false;
  }

  const validated = validateMatchingProfileInput({
    birthYear: profile.birthYear,
    displayName: profile.displayName,
    preferredAgeMin: profile.preferredAgeMin,
    preferredAgeMax: profile.preferredAgeMax,
    gender: profile.gender,
    interestedIn: profile.interestedIn,
    locationText: profile.locationText,
    preferredDistanceKm: profile.preferredDistanceKm ?? DEFAULT_PREFERRED_DISTANCE_KM,
    relationshipIntention: profile.relationshipIntention,
    dealBreakers: profile.dealBreakerKeys ?? [],
  });

  return validated.ok;
}

function readInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function readDisplayName(value: unknown, errors: MatchingProfileValidationCode[]) {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    errors.push("display_name_required");
  }

  if (text.length > 120) {
    errors.push("display_name_too_long");
  }

  return text;
}

function readRequiredText(
  value: unknown,
  field: "gender" | "interestedIn" | "locationText" | "relationshipIntention",
  errors: MatchingProfileValidationCode[],
  maxLength: number,
) {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    errors.push(requiredTextCodeByField[field]);
  }

  if (text.length > maxLength) {
    errors.push(tooLongTextCodeByField[field]);
  }

  return text;
}

function readLocationCoordinates(
  value: unknown,
  errors: MatchingProfileValidationCode[],
): MatchingLocationCoordinates | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!value || typeof value !== "object") {
    errors.push("location_coordinates_invalid");
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const latitude = typeof record.latitude === "number" ? record.latitude : null;
  const longitude = typeof record.longitude === "number" ? record.longitude : null;

  if (
    latitude === null ||
    longitude === null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    errors.push("location_coordinates_invalid");
    return undefined;
  }

  return { latitude, longitude };
}

const requiredTextCodeByField = {
  gender: "gender_required",
  interestedIn: "interested_in_required",
  locationText: "location_text_required",
  relationshipIntention: "relationship_intention_required",
} as const;

const tooLongTextCodeByField = {
  gender: "gender_too_long",
  interestedIn: "interested_in_too_long",
  locationText: "location_text_too_long",
  relationshipIntention: "relationship_intention_too_long",
} as const;
