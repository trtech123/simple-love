import {
  apiError,
  apiSuccess,
} from "@/app/api/envelope";
import {
  DEFAULT_PREFERRED_DISTANCE_KM,
  isMatchingProfileComplete,
  validateMatchingProfileInput,
} from "@/domain/matching/profile";
import { geocodeLocationText } from "@/domain/matching/geocoding";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireAuthenticatedUserId } from "../../matching/auth";

export const dynamic = "force-dynamic";

type ProfileRow = {
  user_id: string;
  display_name: string;
  birth_year: number | null;
  preferred_age_min: number | null;
  preferred_age_max: number | null;
  gender: string | null;
  interested_in: string | null;
  location_text: string | null;
  location_latitude: number | null;
  location_longitude: number | null;
  location_geocoded_at: string | null;
  preferred_distance_km: number | null;
  relationship_intention: string | null;
};

type DealBreakerRow = {
  label: string;
  normalized_key: string;
  other_text: string | null;
};

const AUTHENTICATION_REQUIRED_MESSAGE = "צריך להתחבר כדי להמשיך.";
const PROFILE_INVALID_MESSAGE = "יש פרטים חסרים או לא תקינים בפרופיל ההתאמות.";
const LOCATION_NOT_FOUND_MESSAGE = "לא הצלחנו למצוא את המיקום הזה. כדאי לבחור עיר קרובה או לבדוק את האיות.";
const SCHEMA_UNAVAILABLE_MESSAGE = "צריך להשלים את עדכון מסד הנתונים לפני שאפשר לשמור פרופיל התאמות.";
const PROFILE_SAVE_UNAVAILABLE_MESSAGE = "שמירת פרופיל ההתאמות אינה זמינה כרגע. נסו שוב אחרי עדכון המערכת.";
const MATCHING_PROFILE_MIGRATION = "supabase/migrations/202606020002_matching_profile_preferences.sql";

export async function GET() {
  const userId = await requireAuthenticatedUserId();

  if (!userId) {
    return apiError({
      status: 401,
      code: "authentication_required",
      message: AUTHENTICATION_REQUIRED_MESSAGE,
    });
  }

  const supabase = createServiceRoleClient();
  let profile: ProfileRow | null;
  let dealBreakers: DealBreakerRow[];

  try {
    profile = await loadProfile(supabase, userId);
    dealBreakers = await loadDealBreakers(supabase, userId);
  } catch (error) {
    if (isSchemaUnavailableError(error)) {
      return apiError({
        status: 503,
        code: "matching_schema_missing",
        message: SCHEMA_UNAVAILABLE_MESSAGE,
        details: { migration: MATCHING_PROFILE_MIGRATION },
      });
    }

    return apiError({
      status: 503,
      code: "matching_schema_missing",
      message: PROFILE_SAVE_UNAVAILABLE_MESSAGE,
    });
  }

  return apiSuccess({
    complete: isMatchingProfileComplete({
      displayName: profile?.display_name,
      birthYear: profile?.birth_year,
      preferredAgeMin: profile?.preferred_age_min,
      preferredAgeMax: profile?.preferred_age_max,
      gender: profile?.gender,
      interestedIn: profile?.interested_in,
      locationText: profile?.location_text,
      preferredDistanceKm: profile?.preferred_distance_km ?? DEFAULT_PREFERRED_DISTANCE_KM,
      relationshipIntention: profile?.relationship_intention,
      dealBreakerKeys: dealBreakers.map((item) => item.normalized_key),
    }),
    profile: profile
      ? {
          displayName: profile.display_name,
          birthYear: profile.birth_year,
          preferredAgeMin: profile.preferred_age_min,
          preferredAgeMax: profile.preferred_age_max,
          gender: profile.gender,
          interestedIn: profile.interested_in,
          locationText: profile.location_text,
          preferredDistanceKm: profile.preferred_distance_km ?? DEFAULT_PREFERRED_DISTANCE_KM,
          relationshipIntention: profile.relationship_intention,
        }
      : null,
    dealBreakers: dealBreakers.map((item) => ({
      label: item.label,
      key: item.normalized_key,
      normalizedKey: item.normalized_key,
      otherText: item.other_text,
    })),
  });
}

export async function PUT(request: Request) {
  const userId = await requireAuthenticatedUserId();

  if (!userId) {
    return apiError({
      status: 401,
      code: "authentication_required",
      message: AUTHENTICATION_REQUIRED_MESSAGE,
    });
  }

  const body = await request.json().catch(() => null);
  const parsed = validateMatchingProfileInput(body);

  if (!parsed.ok) {
    return apiError({
      status: 400,
      code: "profile_invalid",
      message: PROFILE_INVALID_MESSAGE,
      details: { errors: parsed.errors.map(toValidationCode) },
    });
  }

  const supabase = createServiceRoleClient();
  const now = new Date().toISOString();
  const { value } = parsed;
  let existingProfile: ProfileRow | null;

  try {
    existingProfile = await loadProfile(supabase, userId);
  } catch (error) {
    return apiError({
      status: 503,
      code: "matching_schema_missing",
      message: isSchemaUnavailableError(error) ? SCHEMA_UNAVAILABLE_MESSAGE : PROFILE_SAVE_UNAVAILABLE_MESSAGE,
      details: isSchemaUnavailableError(error) ? { migration: MATCHING_PROFILE_MIGRATION } : undefined,
    });
  }

  const locationCoordinates = await resolveLocationCoordinates(
    value.locationText,
    existingProfile,
    now,
    value.locationCoordinates,
  );

  if (!locationCoordinates) {
    return apiError({
      status: 400,
      code: "location_not_found",
      message: LOCATION_NOT_FOUND_MESSAGE,
    });
  }

  const { error: saveError } = await supabase.rpc("save_matching_profile", {
    p_user_id: userId,
    p_display_name: value.displayName,
    p_birth_year: value.birthYear,
    p_preferred_age_min: value.preferredAgeMin,
    p_preferred_age_max: value.preferredAgeMax,
    p_gender: value.gender,
    p_interested_in: value.interestedIn,
    p_location_text: value.locationText,
    p_location_latitude: locationCoordinates.latitude,
    p_location_longitude: locationCoordinates.longitude,
    p_location_geocoded_at: locationCoordinates.geocodedAt,
    p_preferred_distance_km: value.preferredDistanceKm ?? DEFAULT_PREFERRED_DISTANCE_KM,
    p_relationship_intention: value.relationshipIntention,
    p_deal_breakers: value.dealBreakers,
  });

  if (saveError) {
    return apiError({
      status: 503,
      code: "matching_schema_missing",
      message: PROFILE_SAVE_UNAVAILABLE_MESSAGE,
      details: { reason: saveError.message },
    });
  }

  return apiSuccess({ complete: true });
}

async function loadProfile(supabase: ReturnType<typeof createServiceRoleClient>, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, display_name, birth_year, preferred_age_min, preferred_age_max, gender, interested_in, location_text, location_latitude, location_longitude, location_geocoded_at, preferred_distance_km, relationship_intention")
    .eq("user_id", userId)
    .maybeSingle<ProfileRow>();

  if (error) {
    throw error;
  }

  return data;
}

async function resolveLocationCoordinates(
  locationText: string,
  profile: ProfileRow | null,
  now: string,
  selectedCoordinates?: { latitude: number; longitude: number },
) {
  if (selectedCoordinates) {
    return {
      latitude: selectedCoordinates.latitude,
      longitude: selectedCoordinates.longitude,
      geocodedAt: now,
    };
  }

  if (!hasLocationTextChanged(profile?.location_text, locationText) && hasStoredCoordinates(profile)) {
    return {
      latitude: profile.location_latitude,
      longitude: profile.location_longitude,
      geocodedAt: profile.location_geocoded_at ?? now,
    };
  }

  try {
    const geocoded = await geocodeLocationText(locationText);

    return geocoded
      ? {
          latitude: geocoded.latitude,
          longitude: geocoded.longitude,
          geocodedAt: now,
        }
      : null;
  } catch {
    return null;
  }
}

function hasLocationTextChanged(previous: string | null | undefined, next: string) {
  return normalizeLocationText(previous) !== normalizeLocationText(next);
}

function normalizeLocationText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function hasStoredCoordinates(
  profile: ProfileRow | null,
): profile is ProfileRow & { location_latitude: number; location_longitude: number } {
  return Number.isFinite(profile?.location_latitude) && Number.isFinite(profile?.location_longitude);
}

async function loadDealBreakers(supabase: ReturnType<typeof createServiceRoleClient>, userId: string) {
  const { data, error } = await supabase
    .from("profile_deal_breakers")
    .select("label, normalized_key, other_text")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .returns<DealBreakerRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

function isSchemaUnavailableError(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? "");
  return /does not exist|schema cache|Could not find|column .* does not exist|relation .* does not exist/i.test(message);
}

function toValidationCode(error: string) {
  const codes: Record<string, string> = {
    "displayName is required": "display_name_required",
    "gender is required": "gender_required",
    "interestedIn is required": "interested_in_required",
    "locationText is required": "location_text_required",
    "relationshipIntention is required": "relationship_intention_required",
    "At least one deal breaker is required": "deal_breakers_required",
    "birthYear must describe an adult profile": "birth_year_invalid",
    "preferredAgeMin is invalid": "preferred_age_min_invalid",
    "preferredAgeMax is invalid": "preferred_age_max_invalid",
    "preferredAgeMin must be lower than preferredAgeMax": "preferred_age_range_invalid",
    "preferredDistanceKm is invalid": "preferred_distance_invalid",
    "locationCoordinates is invalid": "location_coordinates_invalid",
  };

  return codes[error] ?? error;
}
