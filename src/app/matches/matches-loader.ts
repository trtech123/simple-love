import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getE2eMatchesPageData } from "@/testing/e2e-chat-fixture";
import { isMatchingProfileComplete } from "@/domain/matching/profile";

type MatchRow = {
  id: string;
  user_a: string;
  user_b: string;
  score: number;
  match_explanations?: {
    explanation: {
      summary?: string;
      reasons?: string[];
    } | null;
  } | Array<{
    explanation: {
      summary?: string;
      reasons?: string[];
    } | null;
  }> | null;
};

type ProfileRow = {
  user_id: string;
  display_name: string;
  relationship_intention: string | null;
  location_text: string | null;
  birth_year?: number | null;
  preferred_age_min?: number | null;
  preferred_age_max?: number | null;
  preferred_distance_km?: number | null;
  gender?: string | null;
  interested_in?: string | null;
};

export type MatchesPageProfile = {
  userId: string;
  displayName: string;
  relationshipIntention: string | null;
  locationText: string | null;
  completedDepthQuestionnaireAt: string | null;
  matchingProfileComplete: boolean;
  hasMatchingEntitlement: boolean;
};

export type MatchesPageMatch = {
  id: string;
  userA: string;
  userB: string;
  score: number;
  explanationSummary?: string;
  explanationReasons?: string[];
  otherProfile: MatchesPageProfile | null;
};

export type MatchesPageData = {
  profile: MatchesPageProfile | null;
  matches: MatchesPageMatch[];
};

export async function loadMatchesPageData(userId: string, options: { e2eMode?: boolean } = {}): Promise<MatchesPageData> {
  if (options.e2eMode) {
    const data = await getE2eMatchesPageData(userId);
    return {
      ...data,
      profile: data.profile ? { ...data.profile, hasMatchingEntitlement: true } : null,
    matches: data.matches.map((match) => ({
      ...match,
      otherProfile: match.otherProfile ? { ...match.otherProfile, hasMatchingEntitlement: true } : null,
      })),
    };
  }

  const supabase = createServiceRoleClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, display_name, birth_year, preferred_age_min, preferred_age_max, preferred_distance_km, gender, interested_in, relationship_intention, location_text, completed_depth_questionnaire_at")
    .eq("user_id", userId)
    .maybeSingle<ProfileRow & { completed_depth_questionnaire_at: string | null }>();

  if (profileError) {
    throw new Error(profileError.message);
  }

  const dealBreakerKeys = await loadDealBreakerKeys(userId);
  const profileComplete = isProfileComplete(profile, dealBreakerKeys);

  const hasEntitlement = await loadMatchingEntitlement(userId);

  if (!profileComplete || !profile?.completed_depth_questionnaire_at || !hasEntitlement) {
    return {
      profile: profile ? mapProfile(profile, profileComplete, hasEntitlement) : null,
      matches: [],
    };
  }

  const { data: matches, error: matchesError } = await supabase
    .from("matches")
    .select("id, user_a, user_b, score, match_explanations(explanation)")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .eq("status", "active")
    .order("score", { ascending: false })
    .returns<MatchRow[]>();

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const otherUserIds = (matches ?? []).map((match) => (match.user_a === userId ? match.user_b : match.user_a));
  const profilesById = await loadProfilesById(otherUserIds);

  return {
    profile: mapProfile(profile, profileComplete, hasEntitlement),
    matches: (matches ?? []).map((match) => {
      const otherUserId = match.user_a === userId ? match.user_b : match.user_a;
      return {
        id: match.id,
        userA: match.user_a,
        userB: match.user_b,
        score: match.score,
        explanationSummary: readExplanation(match)?.summary,
        explanationReasons: readExplanation(match)?.reasons,
        otherProfile: profilesById.get(otherUserId) ?? null,
      };
    }),
  };
}

function readExplanation(match: MatchRow) {
  const relation = Array.isArray(match.match_explanations)
    ? match.match_explanations[0]
    : match.match_explanations;
  const explanation = relation?.explanation;
  if (!explanation) {
    return null;
  }

  return {
    summary: typeof explanation.summary === "string" ? explanation.summary : undefined,
    reasons: Array.isArray(explanation.reasons)
      ? explanation.reasons.filter((reason): reason is string => typeof reason === "string").slice(0, 3)
      : undefined,
  };
}

async function loadMatchingEntitlement(userId: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("matching_entitlements")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle<{ user_id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

async function loadProfilesById(userIds: string[]) {
  const profilesById = new Map<string, MatchesPageProfile>();

  if (!userIds.length) {
    return profilesById;
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, display_name, relationship_intention, location_text")
    .in("user_id", userIds)
    .returns<ProfileRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  for (const profile of data ?? []) {
    profilesById.set(profile.user_id, mapProfile({ ...profile, completed_depth_questionnaire_at: null }));
  }

  return profilesById;
}

async function loadDealBreakerKeys(userId: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("profile_deal_breakers")
    .select("normalized_key")
    .eq("user_id", userId)
    .returns<{ normalized_key: string }[]>();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((item) => item.normalized_key);
}

function isProfileComplete(
  row: (ProfileRow & { completed_depth_questionnaire_at: string | null }) | null,
  dealBreakerKeys: string[],
) {
  return isMatchingProfileComplete({
    displayName: row?.display_name,
    birthYear: row?.birth_year,
    preferredAgeMin: row?.preferred_age_min,
    preferredAgeMax: row?.preferred_age_max,
    preferredDistanceKm: row?.preferred_distance_km,
    gender: row?.gender,
    interestedIn: row?.interested_in,
    locationText: row?.location_text,
    relationshipIntention: row?.relationship_intention,
    dealBreakerKeys,
  });
}

function mapProfile(
  row: ProfileRow & { completed_depth_questionnaire_at: string | null },
  matchingProfileComplete = true,
  hasMatchingEntitlement = false,
): MatchesPageProfile {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    relationshipIntention: row.relationship_intention,
    locationText: row.location_text,
    completedDepthQuestionnaireAt: row.completed_depth_questionnaire_at,
    matchingProfileComplete,
    hasMatchingEntitlement,
  };
}
