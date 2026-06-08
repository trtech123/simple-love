import { DEFAULT_PREFERRED_DISTANCE_KM } from "./profile";
import { effectiveMatchingTraits, generateMatchesForProfile } from "./scoring";
import type { PublishedMatchSettings } from "./settings";
import type { MatchProfile } from "./types";

type SupabaseLike = {
  from: (table: string) => any;
};

type ProfileRow = {
  user_id: string;
  birth_year: number | null;
  preferred_age_min: number | null;
  preferred_age_max: number | null;
  gender: string | null;
  interested_in: string | null;
  location_text: string | null;
  location_latitude: number | null;
  location_longitude: number | null;
  preferred_distance_km: number | null;
  relationship_intention: string | null;
  disabled_at: string | null;
};

export async function rerunMatchesForUser(input: {
  supabase: SupabaseLike;
  userId: string;
  settings: PublishedMatchSettings;
  profiles: MatchProfile[];
}) {
  const profile = input.profiles.find((item) => item.userId === input.userId);
  if (!profile) {
    return { recalculated: 0, settingsVersionId: input.settings.versionId };
  }

  const matches = generateMatchesForProfile({
    profile,
    candidates: input.profiles.filter((candidate) => candidate.userId !== input.userId),
    settings: input.settings,
  });

  await persistGeneratedMatches(input.supabase, matches);
  await hideStaleActiveMatches(input.supabase, input.userId, new Set(matches.map((match) => pairKey(match.userA, match.userB))));

  return { recalculated: matches.length, settingsVersionId: input.settings.versionId };
}

export async function rerunMatchesGlobally(input: {
  supabase: SupabaseLike;
  settings: PublishedMatchSettings;
  profiles: MatchProfile[];
}) {
  const byPair = new Map<string, ReturnType<typeof generateMatchesForProfile>[number]>();

  for (const profile of input.profiles) {
    const matches = generateMatchesForProfile({
      profile,
      candidates: input.profiles.filter((candidate) => candidate.userId !== profile.userId),
      settings: input.settings,
    });

    for (const match of matches) {
      byPair.set(pairKey(match.userA, match.userB), match);
    }
  }

  const matches = [...byPair.values()];
  await persistGeneratedMatches(input.supabase, matches);
  await hideAllStaleActiveMatches(input.supabase, new Set(matches.map((match) => pairKey(match.userA, match.userB))));

  return { recalculated: matches.length, settingsVersionId: input.settings.versionId };
}

export async function loadMatchProfiles(supabase: SupabaseLike): Promise<MatchProfile[]> {
  const profilesResult = await query(
    chain(supabase.from("profiles"))
      .select(
        "user_id, birth_year, preferred_age_min, preferred_age_max, gender, interested_in, location_text, location_latitude, location_longitude, preferred_distance_km, relationship_intention, disabled_at, completed_depth_questionnaire_at",
      )
      .not("completed_depth_questionnaire_at", "is", null),
  );

  if (profilesResult.error) {
    throw new Error(profilesResult.error.message ?? "Could not load match profiles");
  }

  const profiles = ((profilesResult.data ?? []) as ProfileRow[]).filter((profile) => !profile.disabled_at);
  const userIds = profiles.map((profile) => profile.user_id);
  const [traitsByUser, aiSignalsByUser, blockedByUser, dealBreakerKeysByUser] = await Promise.all([
    loadTraitsByUser(supabase, userIds),
    loadAiSignalsByUser(supabase, userIds),
    loadBlockedUsersByUser(supabase, userIds),
    loadDealBreakerKeysByUser(supabase, userIds),
  ]);

  return profiles.map((profile) => ({
    userId: profile.user_id,
    birthYear: profile.birth_year ?? undefined,
    preferredAgeMin: profile.preferred_age_min ?? undefined,
    preferredAgeMax: profile.preferred_age_max ?? undefined,
    gender: profile.gender ?? undefined,
    interestedIn: profile.interested_in ?? undefined,
    locationText: profile.location_text ?? undefined,
    locationLatitude: profile.location_latitude ?? undefined,
    locationLongitude: profile.location_longitude ?? undefined,
    preferredDistanceKm: profile.preferred_distance_km ?? DEFAULT_PREFERRED_DISTANCE_KM,
    relationshipIntention: profile.relationship_intention ?? undefined,
    dealBreakerKeys: dealBreakerKeysByUser.get(profile.user_id) ?? [],
    blockedUserIds: blockedByUser.get(profile.user_id) ?? [],
    disabled: Boolean(profile.disabled_at),
    traits: effectiveMatchingTraits(
      traitsByUser.get(profile.user_id) ?? {},
      aiSignalsByUser.get(profile.user_id) ?? [],
    ),
  }));
}

async function persistGeneratedMatches(supabase: SupabaseLike, matches: ReturnType<typeof generateMatchesForProfile>) {
  for (const match of matches) {
    const persisted = await query(
      chain(supabase.from("matches"))
        .upsert(
          {
            user_a: match.userA,
            user_b: match.userB,
            match_settings_version_id: match.matchSettingsVersionId,
            score: match.score,
            status: "active",
            calculated_at: new Date().toISOString(),
          },
          { onConflict: "user_a,user_b" },
        )
        .select("id")
        .single(),
    );

    if (persisted.error) {
      throw new Error(persisted.error.message ?? "Match rerun failed");
    }

    const matchId = (persisted.data as { id?: string } | null)?.id;
    if (!matchId) {
      throw new Error("Match rerun failed");
    }

    const explanationResult = await query(
      chain(supabase.from("match_explanations")).upsert(
        {
          match_id: matchId,
          explanation: match.explanation,
        },
        { onConflict: "match_id" },
      ),
    );

    if (explanationResult.error) {
      throw new Error(explanationResult.error.message ?? "Match explanation rerun failed");
    }
  }
}

async function loadTraitsByUser(supabase: SupabaseLike, userIds: string[]) {
  const traitsByUser = new Map<string, Record<string, number>>();
  if (!userIds.length) return traitsByUser;

  const { data, error } = await query(
    chain(supabase.from("profile_traits")).select("user_id, trait_key, numeric_value").in("user_id", userIds),
  );
  if (error) throw new Error(error.message ?? "Could not load traits");

  for (const trait of (data ?? []) as { user_id: string; trait_key: string; numeric_value: number | null }[]) {
    if (trait.numeric_value === null) continue;
    traitsByUser.set(trait.user_id, {
      ...(traitsByUser.get(trait.user_id) ?? {}),
      [trait.trait_key]: Number(trait.numeric_value),
    });
  }

  return traitsByUser;
}

async function loadAiSignalsByUser(supabase: SupabaseLike, userIds: string[]) {
  const signalsByUser = new Map<string, Array<{ traitKey: string; delta: number }>>();
  if (!userIds.length) return signalsByUser;

  const { data, error } = await query(
    chain(supabase.from("ai_coach_soft_signals"))
      .select("user_id, trait_key, delta")
      .in("user_id", userIds)
      .eq("status", "active"),
  );
  if (error) throw new Error(error.message ?? "Could not load AI coach signals");

  for (const signal of (data ?? []) as { user_id: string; trait_key: string; delta: number | null }[]) {
    if (signal.delta === null) continue;
    signalsByUser.set(signal.user_id, [
      ...(signalsByUser.get(signal.user_id) ?? []),
      { traitKey: signal.trait_key, delta: Number(signal.delta) },
    ]);
  }

  return signalsByUser;
}

async function loadBlockedUsersByUser(supabase: SupabaseLike, userIds: string[]) {
  const blockedByUser = new Map<string, string[]>();
  if (!userIds.length) return blockedByUser;

  const { data, error } = await query(
    chain(supabase.from("user_blocks")).select("blocker_id, blocked_user_id").in("blocker_id", userIds),
  );
  if (error) throw new Error(error.message ?? "Could not load blocked users");

  for (const block of (data ?? []) as { blocker_id: string; blocked_user_id: string }[]) {
    blockedByUser.set(block.blocker_id, [...(blockedByUser.get(block.blocker_id) ?? []), block.blocked_user_id]);
  }

  return blockedByUser;
}

async function loadDealBreakerKeysByUser(supabase: SupabaseLike, userIds: string[]) {
  const keysByUser = new Map<string, string[]>();
  if (!userIds.length) return keysByUser;

  const { data, error } = await query(
    chain(supabase.from("profile_deal_breakers")).select("user_id, normalized_key").in("user_id", userIds),
  );
  if (error) throw new Error(error.message ?? "Could not load deal breakers");

  for (const item of (data ?? []) as { user_id: string; normalized_key: string }[]) {
    keysByUser.set(item.user_id, [...(keysByUser.get(item.user_id) ?? []), item.normalized_key]);
  }

  return keysByUser;
}

async function hideStaleActiveMatches(supabase: SupabaseLike, userId: string, compatiblePairs: Set<string>) {
  const { data, error } = await query(
    chain(supabase.from("matches")).select("id, user_a, user_b, status").eq("status", "active"),
  );
  if (error) throw new Error(error.message ?? "Could not load active matches");

  const stale = ((data ?? []) as { id: string; user_a: string; user_b: string }[]).filter(
    (match) =>
      (match.user_a === userId || match.user_b === userId) && !compatiblePairs.has(pairKey(match.user_a, match.user_b)),
  );

  for (const match of stale) {
    const result = await query(chain(supabase.from("matches")).update({ status: "hidden" }).eq("id", match.id));
    if (result.error) throw new Error(result.error.message ?? "Could not hide stale match");
  }
}

async function hideAllStaleActiveMatches(supabase: SupabaseLike, compatiblePairs: Set<string>) {
  const { data, error } = await query(
    chain(supabase.from("matches")).select("id, user_a, user_b, status").eq("status", "active"),
  );
  if (error) throw new Error(error.message ?? "Could not load active matches");

  const stale = ((data ?? []) as { id: string; user_a: string; user_b: string }[]).filter(
    (match) => !compatiblePairs.has(pairKey(match.user_a, match.user_b)),
  );

  for (const match of stale) {
    const result = await query(chain(supabase.from("matches")).update({ status: "hidden" }).eq("id", match.id));
    if (result.error) throw new Error(result.error.message ?? "Could not hide stale match");
  }
}

function pairKey(userA: string, userB: string) {
  return [userA, userB].sort().join(":");
}

function chain(value: unknown): any {
  return value;
}

async function query<T = unknown>(value: Promise<T> | T): Promise<T & { data?: unknown; error?: { message?: string } | null }> {
  return (await value) as T & { data?: unknown; error?: { message?: string } | null };
}
