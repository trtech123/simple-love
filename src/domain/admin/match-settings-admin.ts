import {
  DEFAULT_DEAL_BREAKER_FILTERS,
  DEFAULT_MATCHING_HARD_FILTERS,
  type MatchingHardFilterKey,
} from "@/domain/matching/settings";
import { dealBreakerParticipatesInHardFilters } from "@/domain/matching/deal-breakers";

export function normalizeWeights(weights: Record<string, number>) {
  const entries = Object.entries(weights).filter(([, value]) => value > 0);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  if (total <= 0) {
    throw new Error("At least one active matching weight is required");
  }

  return Object.fromEntries(entries.map(([key, value]) => [key, Math.round((value / total) * 100)]));
}

export function validateMatchSettings(input: {
  weights: Record<string, number>;
  hardFilters: string[];
  dealBreakerFilters?: string[];
}) {
  const hardFilters = uniqueStrings(input.hardFilters);
  const dealBreakerFilters = uniqueStrings(input.dealBreakerFilters ?? DEFAULT_DEAL_BREAKER_FILTERS);

  if (hardFilters.some((key) => !(DEFAULT_MATCHING_HARD_FILTERS as string[]).includes(key))) {
    throw new Error("Unknown matching hard filter");
  }

  if (dealBreakerFilters.some((key) => !dealBreakerParticipatesInHardFilters(key))) {
    throw new Error("Unknown matching hard filter");
  }

  return {
    weights: normalizeWeights(input.weights),
    hardFilters: hardFilters as MatchingHardFilterKey[],
    dealBreakerFilters,
  };
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
