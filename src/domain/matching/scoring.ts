import type { QuizQuestion } from "@/domain/quiz/types";
import type { GeneratedMatch, MatchHardFilters, MatchingTraitKey, MatchProfile, WeightedScoreInput } from "./types";
import { DEFAULT_PREFERRED_DISTANCE_KM } from "./profile";
import { dealBreakerParticipatesInHardFilters } from "./deal-breakers";
import {
  DEFAULT_DEAL_BREAKER_FILTERS,
  DEFAULT_PUBLISHED_MATCH_SETTINGS,
  matchHardFiltersFromSettings,
  type PublishedMatchSettings,
} from "./settings";

export const DEFAULT_MATCHING_WEIGHTS: Record<MatchingTraitKey, number> = {
  emotional_profile: 30,
  communication_style: 22,
  commitment_readiness: 17,
  relationship_vision: 16,
  visual_taste: 15,
};

const CORE_TRAIT_KEYS = [
  "emotional_profile",
  "communication_style",
  "commitment_readiness",
  "relationship_vision",
] as const;

const VISUAL_TASTE_DIMENSIONS = [
  "minimal_expressive",
  "urban_nature",
  "cozy_polished",
  "spontaneous_curated",
  "quiet_social",
] as const;

type VisualTasteDimension = (typeof VISUAL_TASTE_DIMENSIONS)[number];
type CoreMatchingTraitKey = (typeof CORE_TRAIT_KEYS)[number];

export function passesHardFilters(
  a: MatchProfile,
  b: MatchProfile,
  hardFilters: MatchHardFilters = {},
  dealBreakerFilters: string[] = DEFAULT_DEAL_BREAKER_FILTERS,
): boolean {
  const filters = { ...DEFAULT_HARD_FILTERS, ...hardFilters };

  if (filters.disabled_profiles && (a.disabled || b.disabled)) {
    return false;
  }

  if (filters.blocked_users && (a.blockedUserIds?.includes(b.userId) || b.blockedUserIds?.includes(a.userId))) {
    return false;
  }

  if (
    filters.relationship_intention &&
    a.relationshipIntention &&
    b.relationshipIntention &&
    a.relationshipIntention !== b.relationshipIntention
  ) {
    return false;
  }

  if (filters.gender_preference && a.interestedIn && b.gender && a.interestedIn !== b.gender) {
    return false;
  }

  if (filters.gender_preference && b.interestedIn && a.gender && b.interestedIn !== a.gender) {
    return false;
  }

  if (filters.reciprocal_age_range && !passesReciprocalAgeRange(a, b)) {
    return false;
  }

  if (filters.reciprocal_location_radius && !passesReciprocalDistancePreference(a, b)) {
    return false;
  }

  if (filters.deal_breakers && hasDealBreakerOverlap(a.dealBreakerKeys, b.dealBreakerKeys, dealBreakerFilters)) {
    return false;
  }

  return true;
}

export function calculateDistanceKm(a: Pick<MatchProfile, "locationLatitude" | "locationLongitude">, b: Pick<MatchProfile, "locationLatitude" | "locationLongitude">) {
  if (!hasCoordinatePair(a) || !hasCoordinatePair(b)) {
    return null;
  }

  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians((b.locationLatitude as number) - (a.locationLatitude as number));
  const longitudeDelta = toRadians((b.locationLongitude as number) - (a.locationLongitude as number));
  const aLatitude = toRadians(a.locationLatitude as number);
  const bLatitude = toRadians(b.locationLatitude as number);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(aLatitude) * Math.cos(bLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function calculateMatchScore(input: WeightedScoreInput): number {
  return calculateScoreBreakdown(input).final;
}

export function calculateScoreBreakdown(input: WeightedScoreInput) {
  const trait = calculateTraitScore(input);
  const logisticsScores = calculateLogisticsScores(input.a, input.b);
  const final = Math.round(trait * 0.8 + logisticsScores.overall * 0.2);

  return {
    trait: Math.round(trait),
    logistics: logisticsScores.overall,
    final,
    logisticsScores,
  };
}

export function calculateTraitScore(input: WeightedScoreInput): number {
  const activeWeights = Object.entries(input.weights).filter(
    ([traitKey, weight]) => weight > 0 && hasComparableTrait(input.a, input.b, traitKey),
  );
  const totalWeight = activeWeights.reduce((sum, [, weight]) => sum + weight, 0);

  if (totalWeight <= 0) {
    return 0;
  }

  const score = activeWeights.reduce((sum, [traitKey, weight]) => {
    const traitScore = calculateTraitCompatibility(traitKey, input.a, input.b);
    return sum + traitScore * (weight / totalWeight);
  }, 0);

  return score;
}

export function deriveMatchingTraits(input: {
  questions: QuizQuestion[];
  answers: Record<string, string>;
}): Record<string, number> {
  const groupedScores = createCoreScoreGroups();
  const visualScores: Record<VisualTasteDimension, number[]> = {
    minimal_expressive: [],
    urban_nature: [],
    cozy_polished: [],
    spontaneous_curated: [],
    quiet_social: [],
  };

  for (const question of input.questions) {
    if (question.questionType !== "multiple_choice") {
      continue;
    }

    const answerOptionId = input.answers[question.id];
    const selectedOption = question.options.find((option) => option.id === answerOptionId);
    if (!selectedOption) {
      continue;
    }

    if (isVisualTasteQuestion(question)) {
      addVisualTasteScores(visualScores, selectedOption.score);
      continue;
    }

    const traitKey = traitForQuestion(question);
    if (!traitKey) {
      continue;
    }

    groupedScores[traitKey].push(normalizeOptionPosition(question, selectedOption.id));
  }

  const traits: Record<string, number> = {
    emotional_profile: average(groupedScores.emotional_profile),
    communication_style: average(groupedScores.communication_style),
    commitment_readiness: average(groupedScores.commitment_readiness),
    relationship_vision: average(groupedScores.relationship_vision),
  };

  const visualDimensionValues = VISUAL_TASTE_DIMENSIONS.flatMap((dimension) => {
    const value = averageOrNull(visualScores[dimension]);
    if (value === null) {
      return [];
    }

    traits[`visual_taste_${dimension}`] = value;
    return [value];
  });

  if (visualDimensionValues.length) {
    traits.visual_taste = average(visualDimensionValues);
  }

  return traits;
}

export function generateMatchesForProfile(input: {
  profile: MatchProfile;
  candidates: MatchProfile[];
  weights?: Record<MatchingTraitKey, number>;
  hardFilters?: MatchHardFilters;
  settings?: PublishedMatchSettings;
}): GeneratedMatch[] {
  const settings =
    input.settings ??
    (input.weights || input.hardFilters
      ? {
          ...DEFAULT_PUBLISHED_MATCH_SETTINGS,
          weights: input.weights ?? DEFAULT_PUBLISHED_MATCH_SETTINGS.weights,
          hardFilters: hardFilterKeysFromLegacy(input.hardFilters ?? DEFAULT_HARD_FILTERS),
        }
      : DEFAULT_PUBLISHED_MATCH_SETTINGS);
  const weights = settings.weights;
  const hardFilters = input.settings ? matchHardFiltersFromSettings(settings) : input.hardFilters ?? DEFAULT_HARD_FILTERS;
  const activeWeights = activeMatchingWeights(weights);

  return input.candidates
    .filter((candidate) => candidate.userId !== input.profile.userId)
    .filter((candidate) => passesHardFilters(input.profile, candidate, hardFilters, settings.dealBreakerFilters))
    .filter((candidate) => hasAllTraits(input.profile, activeWeights) && hasAllTraits(candidate, activeWeights))
    .map((candidate) => {
      const comparableTraitKeys = Object.keys(activeWeights).filter((traitKey) =>
        hasComparableTrait(input.profile, candidate, traitKey),
      );
      const traitScores = Object.fromEntries(
        comparableTraitKeys.map((traitKey) => {
          return [traitKey, Math.round(calculateTraitCompatibility(traitKey, input.profile, candidate))];
        }),
      ) as Record<MatchingTraitKey, number>;
      const breakdown = calculateScoreBreakdown({
        a: input.profile,
        b: candidate,
        weights,
      });

      const [userA, userB] = [input.profile.userId, candidate.userId].sort();

      return {
        userA,
        userB,
        score: breakdown.final,
        matchSettingsVersionId: settings.versionId,
        explanation: {
          settingsVersionId: settings.versionId,
          summary: buildExplanationSummary(breakdown.final),
          traitScores,
          logisticsScores: breakdown.logisticsScores,
          breakdown: {
            trait: breakdown.trait,
            logistics: breakdown.logistics,
            final: breakdown.final,
          },
          reasons: buildReasons(traitScores, breakdown.logisticsScores),
        },
      };
    })
    .sort((left, right) => right.score - left.score || left.userA.localeCompare(right.userA) || left.userB.localeCompare(right.userB));
}

const DEFAULT_HARD_FILTERS: Required<MatchHardFilters> = {
  disabled_profiles: true,
  blocked_users: true,
  gender_preference: true,
  reciprocal_age_range: true,
  reciprocal_location_radius: true,
  relationship_intention: true,
  deal_breakers: true,
};

function calculateTraitCompatibility(traitKey: string, a: MatchProfile, b: MatchProfile) {
  if (traitKey === "visual_taste") {
    return calculateVisualTasteScore(a, b);
  }

  const aValue = a.traits?.[traitKey] ?? 0;
  const bValue = b.traits?.[traitKey] ?? 0;
  return calculateSingleTraitScore(traitKey, aValue, bValue);
}

function calculateSingleTraitScore(traitKey: string, aValue: number, bValue: number) {
  const gap = Math.abs(aValue - bValue);
  const similarity = Math.max(0, 100 - gap);

  if (traitKey !== "communication_style") {
    return similarity;
  }

  const complementarity = Math.max(0, 100 - Math.abs(gap - 20));
  return similarity * 0.7 + complementarity * 0.3;
}

function calculateVisualTasteScore(a: MatchProfile, b: MatchProfile) {
  const dimensionScores = VISUAL_TASTE_DIMENSIONS.flatMap((dimension) => {
    const aValue = a.traits?.[`visual_taste_${dimension}`];
    const bValue = b.traits?.[`visual_taste_${dimension}`];
    if (typeof aValue !== "number" || typeof bValue !== "number") {
      return [];
    }

    const gap = Math.abs(aValue - bValue);
    const closeScore = gap <= 15 ? 100 - gap * 0.5 : null;
    const moderateScore = gap <= 40 ? 92.5 - (gap - 15) * 1.2 : null;
    const largeScore = 62.5 - (gap - 40) * (dimension === "quiet_social" ? 1.25 : 1);
    return [Math.round(clampScore(closeScore ?? moderateScore ?? largeScore))];
  });

  if (dimensionScores.length) {
    return average(dimensionScores);
  }

  const aValue = a.traits?.visual_taste;
  const bValue = b.traits?.visual_taste;
  if (typeof aValue === "number" && typeof bValue === "number") {
    return calculateSingleTraitScore("visual_taste", aValue, bValue);
  }

  return 0;
}

function calculateLogisticsScores(a: MatchProfile, b: MatchProfile) {
  const reciprocalAgeFit = Math.round((ageFitFor(a, b) + ageFitFor(b, a)) / 2);
  const distanceFit = calculateDistanceFit(a, b);
  const overall = Math.round((reciprocalAgeFit + distanceFit) / 2);

  return {
    reciprocalAgeFit,
    distanceFit,
    overall,
  };
}

function ageFitFor(preferences: MatchProfile, candidate: MatchProfile) {
  const candidateAge = ageFromBirthYear(candidate.birthYear);
  if (candidateAge === null || preferences.preferredAgeMin === undefined || preferences.preferredAgeMax === undefined) {
    return 100;
  }

  if (candidateAge < preferences.preferredAgeMin || candidateAge > preferences.preferredAgeMax) {
    return 0;
  }

  return 100;
}

function calculateDistanceFit(a: MatchProfile, b: MatchProfile) {
  if (!hasLocationPreference(a) && !hasLocationPreference(b)) {
    return 100;
  }

  const distanceKm = calculateDistanceKm(a, b);
  if (distanceKm === null) {
    return 0;
  }

  const tighterPreference = Math.min(preferredDistanceKm(a), preferredDistanceKm(b));
  if (tighterPreference <= 0) {
    return 0;
  }

  return Math.round(Math.max(0, 100 - (distanceKm / tighterPreference) * 100));
}

function buildExplanationSummary(score: number) {
  if (score >= 90) {
    return "Strong fit across the matching profile, questionnaire traits, and practical preferences.";
  }

  if (score >= 75) {
    return "Good fit with several strong compatibility signals.";
  }

  return "Potential fit with some differences worth exploring.";
}

function buildReasons(
  traitScores: Partial<Record<MatchingTraitKey, number>>,
  logisticsScores: { reciprocalAgeFit: number; distanceFit: number; overall: number },
) {
  const strongestTraits = Object.entries(traitScores)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([traitKey]) => `Aligned ${humanizeTraitKey(traitKey)}.`);

  if (logisticsScores.overall >= 85) {
    strongestTraits.push("Practical preferences are a close fit.");
  }

  return strongestTraits.slice(0, 3);
}

function humanizeTraitKey(value: string) {
  return value.replaceAll("_", " ");
}

function traitForQuestion(question: QuizQuestion): CoreMatchingTraitKey | null {
  const number = Number(question.stableKey?.match(/^match_q(\d+)$/)?.[1]);

  if (!Number.isFinite(number)) {
    return null;
  }

  if (number >= 1 && number <= 30) {
    return "emotional_profile";
  }

  if (number >= 31 && number <= 65) {
    return "communication_style";
  }

  if (number >= 66 && number <= 79) {
    return "commitment_readiness";
  }

  if (number >= 80 && number <= 95) {
    return "relationship_vision";
  }

  return null;
}

function isVisualTasteQuestion(question: QuizQuestion) {
  return Boolean(question.usageFlags?.visualTaste) || question.stableKey?.startsWith("visual_taste_");
}

function createCoreScoreGroups() {
  const groups = {} as Record<(typeof CORE_TRAIT_KEYS)[number], number[]>;
  for (const traitKey of CORE_TRAIT_KEYS) {
    groups[traitKey] = [];
  }
  return groups;
}

function addVisualTasteScores(
  visualScores: Record<VisualTasteDimension, number[]>,
  score: Record<string, unknown> | undefined,
) {
  const visualScore = readVisualTasteScore(score);
  if (!visualScore || visualScore.skip === true) {
    return;
  }

  for (const dimension of VISUAL_TASTE_DIMENSIONS) {
    const rawValue = visualScore[dimension];
    if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
      continue;
    }

    visualScores[dimension].push(normalizeVisualDelta(rawValue));
  }
}

function readVisualTasteScore(score: Record<string, unknown> | undefined) {
  if (!score) {
    return null;
  }

  const nested = score.visual_taste ?? score.visualTaste;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }

  if (VISUAL_TASTE_DIMENSIONS.some((dimension) => typeof score[dimension] === "number") || score.skip === true) {
    return score;
  }

  return null;
}

function normalizeVisualDelta(value: number) {
  if (value > 1 && value <= 100) {
    return Math.round(value);
  }

  return Math.round(((Math.max(-1, Math.min(1, value)) + 1) / 2) * 100);
}

function normalizeOptionPosition(question: QuizQuestion, selectedOptionId: string) {
  const options = [...question.options].sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
  const selectedIndex = options.findIndex((option) => option.id === selectedOptionId);

  if (selectedIndex < 0 || options.length <= 1) {
    return 0;
  }

  return Math.round((selectedIndex / (options.length - 1)) * 100);
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function averageOrNull(values: number[]) {
  return values.length ? average(values) : null;
}

function hasAllTraits(profile: MatchProfile, weights: Record<string, number>) {
  return Object.keys(weights).every(
    (traitKey) => traitKey === "visual_taste" || typeof profile.traits?.[traitKey] === "number",
  );
}

function hasComparableTrait(a: MatchProfile, b: MatchProfile, traitKey: string) {
  if (traitKey === "visual_taste") {
    return hasVisualTasteSignal(a) && hasVisualTasteSignal(b);
  }

  return typeof a.traits?.[traitKey] === "number" && typeof b.traits?.[traitKey] === "number";
}

function hasVisualTasteSignal(profile: MatchProfile) {
  return (
    typeof profile.traits?.visual_taste === "number" ||
    VISUAL_TASTE_DIMENSIONS.some((dimension) => typeof profile.traits?.[`visual_taste_${dimension}`] === "number")
  );
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function passesReciprocalAgeRange(a: MatchProfile, b: MatchProfile) {
  const aAge = ageFromBirthYear(a.birthYear);
  const bAge = ageFromBirthYear(b.birthYear);

  if (
    aAge !== null &&
    b.preferredAgeMin !== undefined &&
    b.preferredAgeMax !== undefined &&
    (aAge < b.preferredAgeMin || aAge > b.preferredAgeMax)
  ) {
    return false;
  }

  if (
    bAge !== null &&
    a.preferredAgeMin !== undefined &&
    a.preferredAgeMax !== undefined &&
    (bAge < a.preferredAgeMin || bAge > a.preferredAgeMax)
  ) {
    return false;
  }

  return true;
}

function ageFromBirthYear(birthYear?: number) {
  if (!birthYear) {
    return null;
  }

  return new Date().getFullYear() - birthYear;
}

function passesReciprocalDistancePreference(a: MatchProfile, b: MatchProfile) {
  if (!hasLocationPreference(a) && !hasLocationPreference(b)) {
    return true;
  }

  const distanceKm = calculateDistanceKm(a, b);

  if (distanceKm === null) {
    return false;
  }

  return distanceKm <= preferredDistanceKm(a) && distanceKm <= preferredDistanceKm(b);
}

function hasLocationPreference(profile: MatchProfile) {
  return Boolean(profile.locationText?.trim()) || hasCoordinatePair(profile);
}

function hasCoordinatePair(profile: Pick<MatchProfile, "locationLatitude" | "locationLongitude">) {
  return Number.isFinite(profile.locationLatitude) && Number.isFinite(profile.locationLongitude);
}

function preferredDistanceKm(profile: MatchProfile) {
  return typeof profile.preferredDistanceKm === "number" && profile.preferredDistanceKm > 0
    ? profile.preferredDistanceKm
    : DEFAULT_PREFERRED_DISTANCE_KM;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function hasDealBreakerOverlap(a: string[] = [], b: string[] = [], configuredFilters: string[]) {
  const participating = new Set(configuredFilters.map(normalizeHardFilterDealBreakerKey).filter(Boolean));
  const bKeys = new Set(b.map(normalizeHardFilterDealBreakerKey).filter((key) => key && participating.has(key)));
  return a
    .map(normalizeHardFilterDealBreakerKey)
    .some((key) => key !== null && participating.has(key) && bKeys.has(key));
}

function normalizeHardFilterDealBreakerKey(key: string) {
  const normalized = key.trim().toLowerCase();
  return normalized && dealBreakerParticipatesInHardFilters(normalized) ? normalized : null;
}

function activeMatchingWeights(weights: Record<MatchingTraitKey, number>) {
  return Object.fromEntries(Object.entries(weights).filter(([, weight]) => weight > 0)) as Record<MatchingTraitKey, number>;
}

function hardFilterKeysFromLegacy(filters: MatchHardFilters) {
  const keys: PublishedMatchSettings["hardFilters"] = [];
  if (filters.gender_preference) keys.push("gender");
  if (filters.reciprocal_age_range) keys.push("age_range");
  if (filters.reciprocal_location_radius) keys.push("distance");
  if (filters.relationship_intention) keys.push("relationship_intention");
  if (filters.deal_breakers) keys.push("deal_breakers");
  return keys;
}
