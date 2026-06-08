import { apiError, apiSuccess } from "@/app/api/envelope";
import { requireAuthenticatedUserId } from "@/app/api/matching/auth";
import { DEFAULT_PREFERRED_DISTANCE_KM, validateMatchingProfileInput } from "@/domain/matching/profile";
import { loadMatchProfiles, rerunMatchesForUser } from "@/domain/matching/rerun";
import { loadPublishedMatchSettings } from "@/domain/matching/settings-repository";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const userId = await requireAuthenticatedUserId();
  if (!userId) {
    return apiError({ status: 401, code: "authentication_required", message: "צריך להתחבר כדי להמשיך." });
  }

  const { id } = await context.params;
  const supabase = createServiceRoleClient();
  const suggestion = await loadPendingSuggestion(supabase, userId, id);
  if (!suggestion) {
    return apiError({ status: 404, code: "suggestion_not_found", message: "ההצעה כבר לא זמינה." });
  }

  const profile = await loadProfile(supabase, userId);
  const dealBreakers = await loadDealBreakers(supabase, userId);
  const nextInput = applySuggestion(
    {
      displayName: profile.display_name,
      birthYear: profile.birth_year,
      preferredAgeMin: profile.preferred_age_min,
      preferredAgeMax: profile.preferred_age_max,
      gender: profile.gender,
      interestedIn: profile.interested_in,
      locationText: profile.location_text,
      locationCoordinates:
        Number.isFinite(profile.location_latitude) && Number.isFinite(profile.location_longitude)
          ? { latitude: profile.location_latitude, longitude: profile.location_longitude }
          : undefined,
      preferredDistanceKm: profile.preferred_distance_km ?? DEFAULT_PREFERRED_DISTANCE_KM,
      relationshipIntention: profile.relationship_intention,
      dealBreakers,
    },
    suggestion,
  );

  const parsed = validateMatchingProfileInput(nextInput);
  if (!parsed.ok) {
    return apiError({
      status: 400,
      code: "suggestion_invalid",
      message: "אי אפשר להחיל את ההצעה על הפרופיל הנוכחי.",
      details: { errors: parsed.errors },
    });
  }

  const { value } = parsed;
  const save = await supabase.rpc("save_matching_profile", {
    p_user_id: userId,
    p_display_name: value.displayName,
    p_birth_year: value.birthYear,
    p_preferred_age_min: value.preferredAgeMin,
    p_preferred_age_max: value.preferredAgeMax,
    p_gender: value.gender,
    p_interested_in: value.interestedIn,
    p_location_text: value.locationText,
    p_location_latitude: value.locationCoordinates?.latitude ?? profile.location_latitude,
    p_location_longitude: value.locationCoordinates?.longitude ?? profile.location_longitude,
    p_location_geocoded_at: profile.location_geocoded_at ?? new Date().toISOString(),
    p_preferred_distance_km: value.preferredDistanceKm ?? DEFAULT_PREFERRED_DISTANCE_KM,
    p_relationship_intention: value.relationshipIntention,
    p_deal_breakers: value.dealBreakers,
  });

  if (save.error) {
    return apiError({ status: 503, code: "profile_save_failed", message: "שמירת הפרופיל נכשלה." });
  }

  await supabase
    .from("ai_coach_hard_filter_suggestions")
    .update({ status: "applied", applied_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);

  await rerunUserMatchesIfPossible(supabase, userId);

  return apiSuccess({ applied: true });
}

async function loadPendingSuggestion(supabase: ReturnType<typeof createServiceRoleClient>, userId: string, id: string) {
  const { data, error } = await supabase
    .from("ai_coach_hard_filter_suggestions")
    .select("id, field, value")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle<{ id: string; field: string; value: unknown }>();

  if (error) throw new Error(error.message);
  return data;
}

async function loadProfile(supabase: ReturnType<typeof createServiceRoleClient>, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, birth_year, preferred_age_min, preferred_age_max, gender, interested_in, location_text, location_latitude, location_longitude, location_geocoded_at, preferred_distance_km, relationship_intention")
    .eq("user_id", userId)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Profile missing");
  return data as {
    display_name: string;
    birth_year: number;
    preferred_age_min: number;
    preferred_age_max: number;
    gender: string;
    interested_in: string;
    location_text: string;
    location_latitude: number;
    location_longitude: number;
    location_geocoded_at: string | null;
    preferred_distance_km: number | null;
    relationship_intention: string;
  };
}

async function loadDealBreakers(supabase: ReturnType<typeof createServiceRoleClient>, userId: string) {
  const { data, error } = await supabase
    .from("profile_deal_breakers")
    .select("normalized_key")
    .eq("user_id", userId)
    .returns<{ normalized_key: string }[]>();

  if (error) throw new Error(error.message);
  return (data ?? []).map((item) => item.normalized_key);
}

function applySuggestion(profile: Record<string, unknown>, suggestion: { field: string; value: unknown }) {
  const next = { ...profile };

  if (suggestion.field === "dealBreakers") {
    next.dealBreakers = Array.isArray(suggestion.value) ? suggestion.value : profile.dealBreakers;
  } else {
    next[suggestion.field] = suggestion.value;
  }

  return next;
}

async function rerunUserMatchesIfPossible(supabase: ReturnType<typeof createServiceRoleClient>, userId: string) {
  try {
    const [settings, profiles] = await Promise.all([
      loadPublishedMatchSettings(supabase),
      loadMatchProfiles(supabase),
    ]);
    await rerunMatchesForUser({ supabase, userId, settings, profiles });
  } catch {
    // Applying the profile change should not fail just because local matching fixtures are absent.
  }
}
