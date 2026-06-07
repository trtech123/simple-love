import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuizQuestionnaire, QuizRepository, QuizSessionRecord } from "./session";
import { reportQuestionnaireSeed } from "@/data/seeds/report-questionnaire";
import { matchingQuestionnaireSeed } from "@/data/seeds/matching-questionnaire";
import type { MatchingSessionRepository } from "@/domain/matching/session";
import { DEFAULT_PREFERRED_DISTANCE_KM, isMatchingProfileComplete } from "@/domain/matching/profile";
import { DEFAULT_MATCHING_WEIGHTS, deriveMatchingTraits, generateMatchesForProfile } from "@/domain/matching/scoring";
import {
  DEFAULT_DEAL_BREAKER_FILTERS,
  DEFAULT_MATCHING_HARD_FILTERS,
  parsePublishedMatchSettings,
  type PublishedMatchSettings,
} from "@/domain/matching/settings";
import type { MatchProfile } from "@/domain/matching/types";

type DbQuestionnaire = { id: string; title: string };
type DbVersion = { id: string };
type DbBlock = { id: string; position: number };
type DbQuestion = {
  id: string;
  stable_key: string;
  prompt: string;
  question_type: "multiple_choice" | "scale" | "open_text";
  position: number;
  questionnaire_block_id: string;
  usage_flags?: Record<string, boolean>;
  trait_mapping?: Record<string, unknown>;
};
type DbOption = {
  id: string;
  question_id: string;
  label: string;
  value: string;
  position: number;
  score?: Record<string, unknown>;
};
type DbSession = {
  id: string;
  public_token: string;
  user_id: string | null;
  questionnaire_version_id: string;
  status: QuizSessionRecord["status"];
};
type DbAnswer = {
  question_id: string;
  question_option_id: string;
};

export function createSupabaseQuizRepository(supabase: SupabaseClient): QuizRepository {
  return {
    async getPublishedReportQuestionnaire() {
      return getPublishedQuestionnaire(supabase, "paid_report");
    },
    async createSession({ publicToken, questionnaireVersionId }) {
      const { data, error } = await supabase
        .from("quiz_sessions")
        .insert({
          public_token: publicToken,
          questionnaire_version_id: questionnaireVersionId,
          status: "started",
        })
        .select("id, public_token, user_id, questionnaire_version_id, status")
        .single<DbSession>();

      if (error) {
        throw new Error(error.message);
      }

      return mapSession(data, []);
    },
    async getSessionByToken(publicToken) {
      const { data: session, error } = await supabase
        .from("quiz_sessions")
        .select("id, public_token, user_id, questionnaire_version_id, status")
        .eq("public_token", publicToken)
        .maybeSingle<DbSession>();

      if (error) {
        throw new Error(error.message);
      }

      if (!session) {
        return null;
      }

      const { data: answers, error: answersError } = await supabase
        .from("quiz_answers")
        .select("question_id, question_option_id")
        .eq("quiz_session_id", session.id)
        .returns<DbAnswer[]>();

      if (answersError) {
        throw new Error(answersError.message);
      }

      return mapSession(session, answers ?? []);
    },
    async upsertAnswer({ sessionId, questionId, questionOptionId }) {
      const { error } = await supabase.from("quiz_answers").upsert(
        {
          quiz_session_id: sessionId,
          question_id: questionId,
          question_option_id: questionOptionId,
        },
        { onConflict: "quiz_session_id,question_id" },
      );

      if (error) {
        throw new Error(error.message);
      }
    },
    async markSessionCompleted(sessionId) {
      const { error } = await supabase
        .from("quiz_sessions")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId);

      if (error) {
        throw new Error(error.message);
      }
    },
  };
}

export async function seedPublishedReportQuestionnaire(supabase: SupabaseClient) {
  return seedPublishedQuestionnaire(supabase, reportQuestionnaireSeed);
}

export async function seedPublishedMatchingQuestionnaire(supabase: SupabaseClient) {
  return seedPublishedQuestionnaire(supabase, matchingQuestionnaireSeed);
}

export function createSupabaseMatchingSessionRepository(supabase: SupabaseClient): MatchingSessionRepository {
  return {
    async getPublishedMatchingQuestionnaire() {
      return getPublishedQuestionnaire(supabase, "matching");
    },
    async isMatchingProfileComplete(userId) {
      return loadMatchingProfileCompletion(supabase, userId);
    },
    async getLatestSessionForUser(userId) {
      const { data: questionnaire, error: questionnaireError } = await supabase
        .from("questionnaires")
        .select("id")
        .eq("slug", matchingQuestionnaireSeed.slug)
        .eq("purpose", "matching")
        .maybeSingle<{ id: string }>();

      if (questionnaireError) {
        throw new Error(questionnaireError.message);
      }

      if (!questionnaire) {
        return null;
      }

      const { data: versions, error: versionError } = await supabase
        .from("questionnaire_versions")
        .select("id")
        .eq("questionnaire_id", questionnaire.id)
        .returns<{ id: string }[]>();

      if (versionError) {
        throw new Error(versionError.message);
      }

      const versionIds = (versions ?? []).map((version) => version.id);
      if (!versionIds.length) {
        return null;
      }

      const { data: session, error } = await supabase
        .from("quiz_sessions")
        .select("id, public_token, user_id, questionnaire_version_id, status")
        .eq("user_id", userId)
        .in("questionnaire_version_id", versionIds)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<DbSession>();

      if (error) {
        throw new Error(error.message);
      }

      if (!session) {
        return null;
      }

      return loadSessionAnswers(supabase, session);
    },
    async createSession({ publicToken, questionnaireVersionId, userId }) {
      const { data, error } = await supabase
        .from("quiz_sessions")
        .insert({
          public_token: publicToken,
          questionnaire_version_id: questionnaireVersionId,
          user_id: userId,
          status: "started",
        })
        .select("id, public_token, user_id, questionnaire_version_id, status")
        .single<DbSession>();

      if (error) {
        throw new Error(error.message);
      }

      return mapSession(data, []);
    },
    async getSessionByToken(publicToken) {
      const { data: session, error } = await supabase
        .from("quiz_sessions")
        .select("id, public_token, user_id, questionnaire_version_id, status")
        .eq("public_token", publicToken)
        .maybeSingle<DbSession>();

      if (error) {
        throw new Error(error.message);
      }

      return session ? loadSessionAnswers(supabase, session) : null;
    },
    async upsertAnswer({ sessionId, questionId, questionOptionId }) {
      const { error } = await supabase.from("quiz_answers").upsert(
        {
          quiz_session_id: sessionId,
          question_id: questionId,
          question_option_id: questionOptionId,
        },
        { onConflict: "quiz_session_id,question_id" },
      );

      if (error) {
        throw new Error(error.message);
      }
    },
    async markSessionCompleted(sessionId) {
      const { error } = await supabase
        .from("quiz_sessions")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId);

      if (error) {
        throw new Error(error.message);
      }
    },
    async upsertTraitsAndGenerateMatches(userId, session, questionnaire) {
      const traits = deriveMatchingTraits({ questions: questionnaire.questions, answers: session.answers });
      const now = new Date().toISOString();

      for (const [traitKey, numericValue] of Object.entries(traits)) {
        const { error } = await supabase.from("profile_traits").upsert(
          {
            user_id: userId,
            trait_key: traitKey,
            numeric_value: numericValue,
            text_value: null,
            source_answer_ids: [],
          },
          { onConflict: "user_id,trait_key" },
        );

        if (error) {
          throw new Error(error.message);
        }
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ completed_depth_questionnaire_at: now, updated_at: now })
        .eq("user_id", userId);

      if (profileError) {
        throw new Error(profileError.message);
      }

      return generateAndPersistMatches(supabase, userId);
    },
  };
}

export async function seedPublishedQuestionnaire(supabase: SupabaseClient, seed = reportQuestionnaireSeed) {
  const { data: questionnaire, error: questionnaireError } = await supabase
    .from("questionnaires")
    .upsert(
      {
        slug: seed.slug,
        title: seed.title,
        purpose: seed.purpose,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single<{ id: string }>();

  if (questionnaireError) {
    throw new Error(questionnaireError.message);
  }

  const { data: version, error: versionError } = await supabase
    .from("questionnaire_versions")
    .upsert(
      {
        questionnaire_id: questionnaire.id,
        version: 1,
        status: "published",
        published_at: new Date().toISOString(),
      },
      { onConflict: "questionnaire_id,version" },
    )
    .select("id")
    .single<{ id: string }>();

  if (versionError) {
    throw new Error(versionError.message);
  }

  for (const [blockIndex, block] of seed.blocks.entries()) {
    const { data: dbBlock, error: blockError } = await supabase
      .from("questionnaire_blocks")
      .upsert(
        {
          questionnaire_version_id: version.id,
          title: block.title,
          position: blockIndex + 1,
        },
        { onConflict: "questionnaire_version_id,position" },
      )
      .select("id")
      .single<{ id: string }>();

    if (blockError) {
      throw new Error(blockError.message);
    }

    for (const [questionIndex, question] of block.questions.entries()) {
      const { data: dbQuestion, error: questionError } = await supabase
        .from("questions")
        .upsert(
          {
            questionnaire_block_id: dbBlock.id,
            stable_key: question.stableKey,
            prompt: question.prompt,
            question_type: question.type,
            position: questionIndex + 1,
            usage_flags: question.usageFlags,
            trait_mapping: question.traitMapping ?? {},
          },
          { onConflict: "questionnaire_block_id,position" },
        )
        .select("id")
        .single<{ id: string }>();

      if (questionError) {
        throw new Error(questionError.message);
      }

      for (const [optionIndex, option] of (question.options ?? []).entries()) {
        const { error: optionError } = await supabase.from("question_options").upsert(
          {
            question_id: dbQuestion.id,
            label: option.label,
            value: option.value,
            position: optionIndex + 1,
            score: option.score ?? {},
          },
          { onConflict: "question_id,value" },
        );

        if (optionError) {
          throw new Error(optionError.message);
        }
      }
    }
  }

  return version.id;
}

async function getPublishedQuestionnaire(
  supabase: SupabaseClient,
  purpose: "paid_report" | "matching",
): Promise<QuizQuestionnaire | null> {
  const seed = purpose === "matching" ? matchingQuestionnaireSeed : reportQuestionnaireSeed;
  const { data: questionnaire, error: questionnaireError } = await supabase
    .from("questionnaires")
    .select("id, title")
    .eq("slug", seed.slug)
    .eq("purpose", purpose)
    .maybeSingle<DbQuestionnaire>();

  if (questionnaireError) {
    throw new Error(questionnaireError.message);
  }

  if (!questionnaire) {
    return null;
  }

  const { data: version, error: versionError } = await supabase
    .from("questionnaire_versions")
    .select("id")
    .eq("questionnaire_id", questionnaire.id)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<DbVersion>();

  if (versionError) {
    throw new Error(versionError.message);
  }

  if (!version) {
    return null;
  }

  const { data: blocks, error: blocksError } = await supabase
    .from("questionnaire_blocks")
    .select("id, position")
    .eq("questionnaire_version_id", version.id)
    .order("position", { ascending: true })
    .returns<DbBlock[]>();

  if (blocksError) {
    throw new Error(blocksError.message);
  }

  const blockIds = (blocks ?? []).map((block) => block.id);
  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select("id, stable_key, prompt, question_type, position, questionnaire_block_id, usage_flags, trait_mapping")
    .in("questionnaire_block_id", blockIds)
    .order("position", { ascending: true })
    .returns<DbQuestion[]>();

  if (questionsError) {
    throw new Error(questionsError.message);
  }

  const questionIds = (questions ?? []).map((question) => question.id);
  const { data: options, error: optionsError } = await supabase
    .from("question_options")
    .select("id, question_id, label, value, position, score")
    .in("question_id", questionIds)
    .order("position", { ascending: true })
    .returns<DbOption[]>();

  if (optionsError) {
    throw new Error(optionsError.message);
  }

  const blockPosition = new Map((blocks ?? []).map((block) => [block.id, block.position]));
  const optionsByQuestion = new Map<string, DbOption[]>();

  for (const option of options ?? []) {
    optionsByQuestion.set(option.question_id, [...(optionsByQuestion.get(option.question_id) ?? []), option]);
  }

  return {
    id: version.id,
    title: questionnaire.title,
    questions: (questions ?? [])
      .sort((left, right) => {
        const blockDelta =
          (blockPosition.get(left.questionnaire_block_id) ?? 0) -
          (blockPosition.get(right.questionnaire_block_id) ?? 0);
        return blockDelta || left.position - right.position;
      })
      .map((question) => ({
        id: question.id,
        stableKey: question.stable_key,
        prompt: question.prompt,
        questionType: question.question_type,
        position: question.position,
        usageFlags: question.usage_flags ?? {},
        traitMapping: question.trait_mapping ?? {},
        options: (optionsByQuestion.get(question.id) ?? []).map((option) => ({
          id: option.id,
          label: option.label,
          value: option.value,
          position: option.position,
          score: option.score ?? {},
        })),
      })),
  };
}

function mapSession(session: DbSession, answers: DbAnswer[]): QuizSessionRecord {
  return {
    id: session.id,
    publicToken: session.public_token,
    userId: session.user_id,
    questionnaireVersionId: session.questionnaire_version_id,
    status: session.status,
    answers: Object.fromEntries(
      answers
        .filter((answer) => answer.question_option_id)
        .map((answer) => [answer.question_id, answer.question_option_id]),
    ),
  };
}

async function loadSessionAnswers(supabase: SupabaseClient, session: DbSession) {
  const { data: answers, error: answersError } = await supabase
    .from("quiz_answers")
    .select("question_id, question_option_id")
    .eq("quiz_session_id", session.id)
    .returns<DbAnswer[]>();

  if (answersError) {
    throw new Error(answersError.message);
  }

  return mapSession(session, answers ?? []);
}

async function generateAndPersistMatches(supabase: SupabaseClient, userId: string) {
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("user_id, birth_year, preferred_age_min, preferred_age_max, gender, interested_in, location_text, location_latitude, location_longitude, preferred_distance_km, relationship_intention, disabled_at")
    .is("disabled_at", null)
    .not("completed_depth_questionnaire_at", "is", null)
    .returns<
      {
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
      }[]
    >();

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const userIds = (profiles ?? []).map((profile) => profile.user_id);
  if (!userIds.includes(userId)) {
    userIds.push(userId);
  }

  const [traitsByUser, blockedByUser, dealBreakerKeysByUser] = await Promise.all([
    loadTraitsByUser(supabase, userIds),
    loadBlockedUsersByUser(supabase, userIds),
    loadDealBreakerKeysByUser(supabase, userIds),
  ]);

  const matchProfiles: MatchProfile[] = (profiles ?? []).map((profile) => ({
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
    traits: traitsByUser.get(profile.user_id) ?? {},
  }));

  const currentProfile = matchProfiles.find((profile) => profile.userId === userId);
  if (!currentProfile) {
    return 0;
  }

  const settingsVersion = await getLatestPublishedMatchSettingsVersion(supabase);
  const matches = generateMatchesForProfile({
    profile: currentProfile,
    candidates: matchProfiles.filter((profile) => profile.userId !== userId),
    settings: settingsVersion,
  });
  const compatiblePairs = new Set(matches.map((match) => pairKey(match.userA, match.userB)));

  for (const match of matches) {
    const { data: persisted, error: matchError } = await supabase
      .from("matches")
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
      .single<{ id: string }>();

    if (matchError) {
      throw new Error(matchError.message);
    }

    const { error: explanationError } = await supabase.from("match_explanations").upsert(
      {
        match_id: persisted.id,
        explanation: match.explanation,
      },
      { onConflict: "match_id" },
    );

    if (explanationError) {
      throw new Error(explanationError.message);
    }
  }

  await hideStaleActiveMatches(supabase, userId, compatiblePairs);

  return matches.length;
}

async function loadTraitsByUser(supabase: SupabaseClient, userIds: string[]) {
  const traitsByUser = new Map<string, Record<string, number>>();

  if (!userIds.length) {
    return traitsByUser;
  }

  const { data, error } = await supabase
    .from("profile_traits")
    .select("user_id, trait_key, numeric_value")
    .in("user_id", userIds)
    .returns<{ user_id: string; trait_key: string; numeric_value: number | null }[]>();

  if (error) {
    throw new Error(error.message);
  }

  for (const trait of data ?? []) {
    if (trait.numeric_value === null) {
      continue;
    }

    traitsByUser.set(trait.user_id, {
      ...(traitsByUser.get(trait.user_id) ?? {}),
      [trait.trait_key]: Number(trait.numeric_value),
    });
  }

  return traitsByUser;
}

async function loadBlockedUsersByUser(supabase: SupabaseClient, userIds: string[]) {
  const blockedByUser = new Map<string, string[]>();

  if (!userIds.length) {
    return blockedByUser;
  }

  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocker_id, blocked_user_id")
    .in("blocker_id", userIds)
    .returns<{ blocker_id: string; blocked_user_id: string }[]>();

  if (error) {
    throw new Error(error.message);
  }

  for (const block of data ?? []) {
    blockedByUser.set(block.blocker_id, [...(blockedByUser.get(block.blocker_id) ?? []), block.blocked_user_id]);
  }

  return blockedByUser;
}

async function loadDealBreakerKeysByUser(supabase: SupabaseClient, userIds: string[]) {
  const dealBreakerKeysByUser = new Map<string, string[]>();

  if (!userIds.length) {
    return dealBreakerKeysByUser;
  }

  const { data, error } = await supabase
    .from("profile_deal_breakers")
    .select("user_id, normalized_key")
    .in("user_id", userIds)
    .returns<{ user_id: string; normalized_key: string }[]>();

  if (error) {
    throw new Error(error.message);
  }

  for (const item of data ?? []) {
    dealBreakerKeysByUser.set(item.user_id, [
      ...(dealBreakerKeysByUser.get(item.user_id) ?? []),
      item.normalized_key,
    ]);
  }

  return dealBreakerKeysByUser;
}

async function loadMatchingProfileCompletion(supabase: SupabaseClient, userId: string) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("birth_year, preferred_age_min, preferred_age_max, gender, interested_in, location_text, preferred_distance_km, relationship_intention")
    .eq("user_id", userId)
    .maybeSingle<{
      birth_year: number | null;
      preferred_age_min: number | null;
      preferred_age_max: number | null;
      gender: string | null;
      interested_in: string | null;
      location_text: string | null;
      preferred_distance_km: number | null;
      relationship_intention: string | null;
    }>();

  if (error) {
    throw new Error(error.message);
  }

  if (!profile) {
    return false;
  }

  const dealBreakerKeys = await loadDealBreakerKeysByUser(supabase, [userId]);

  return isMatchingProfileComplete({
    birthYear: profile.birth_year,
    preferredAgeMin: profile.preferred_age_min,
    preferredAgeMax: profile.preferred_age_max,
    gender: profile.gender,
    interestedIn: profile.interested_in,
    locationText: profile.location_text,
    preferredDistanceKm: profile.preferred_distance_km ?? DEFAULT_PREFERRED_DISTANCE_KM,
    relationshipIntention: profile.relationship_intention,
    dealBreakerKeys: dealBreakerKeys.get(userId) ?? [],
  });
}

async function getLatestPublishedMatchSettingsVersion(supabase: SupabaseClient): Promise<PublishedMatchSettings> {
  const { data: published, error: publishedError } = await supabase
    .from("match_settings_versions")
    .select("id, weights, hard_filters, deal_breaker_filters")
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      weights: Record<string, number> | null;
      hard_filters: unknown;
      deal_breaker_filters?: unknown;
    }>();

  if (publishedError) {
    throw new Error(publishedError.message);
  }

  if (published) {
    const parsed = parsePublishedMatchSettings(published);
    if (!parsed.ok) {
      throw new Error(parsed.errors.map((error) => error.message).join(" "));
    }
    return parsed.value;
  }

  return ensureDefaultMatchSettingsVersion(supabase);
}

async function ensureDefaultMatchSettingsVersion(supabase: SupabaseClient) {
  const { data: settings, error: settingsError } = await supabase
    .from("match_settings")
    .upsert({ slug: "default-v1" }, { onConflict: "slug" })
    .select("id")
    .single<{ id: string }>();

  if (settingsError) {
    throw new Error(settingsError.message);
  }

  const { data: version, error: versionError } = await supabase
    .from("match_settings_versions")
    .upsert(
      {
        match_settings_id: settings.id,
        version: 1,
        status: "published",
        weights: DEFAULT_MATCHING_WEIGHTS,
        hard_filters: DEFAULT_MATCHING_HARD_FILTERS,
        deal_breaker_filters: DEFAULT_DEAL_BREAKER_FILTERS,
        published_at: new Date().toISOString(),
      },
      { onConflict: "match_settings_id,version" },
    )
    .select("id")
    .single<{ id: string }>();

  if (versionError) {
    throw new Error(versionError.message);
  }

  return {
    versionId: version.id,
    weights: DEFAULT_MATCHING_WEIGHTS,
    hardFilters: DEFAULT_MATCHING_HARD_FILTERS,
    dealBreakerFilters: DEFAULT_DEAL_BREAKER_FILTERS,
  };
}

async function hideStaleActiveMatches(supabase: SupabaseClient, userId: string, compatiblePairs: Set<string>) {
  const { data: activeMatches, error } = await supabase
    .from("matches")
    .select("id, user_a, user_b, status")
    .eq("status", "active")
    .returns<{ id: string; user_a: string; user_b: string; status: string }[]>();

  if (error) {
    throw new Error(error.message);
  }

  const staleMatches = (activeMatches ?? []).filter(
    (match) =>
      (match.user_a === userId || match.user_b === userId) && !compatiblePairs.has(pairKey(match.user_a, match.user_b)),
  );

  for (const match of staleMatches) {
    const { error: updateError } = await supabase.from("matches").update({ status: "hidden" }).eq("id", match.id);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }
}

function pairKey(userA: string, userB: string) {
  return [userA, userB].sort().join(":");
}
