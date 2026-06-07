import { dealBreakerParticipatesInHardFilters } from "./deal-breakers";
import type { MatchHardFilters, MatchingTraitKey } from "./types";

export type MatchingHardFilterKey = "gender" | "age_range" | "distance" | "relationship_intention" | "deal_breakers";

export type PublishedMatchSettings = {
  versionId: string;
  weights: Record<MatchingTraitKey, number>;
  hardFilters: MatchingHardFilterKey[];
  dealBreakerFilters: string[];
};

export const DEFAULT_MATCHING_HARD_FILTERS: MatchingHardFilterKey[] = [
  "gender",
  "age_range",
  "distance",
  "relationship_intention",
  "deal_breakers",
];

export const DEFAULT_DEAL_BREAKER_FILTERS = [
  "smoking",
  "wants_children_mismatch",
  "religion_values_mismatch",
  "political_values_mismatch",
  "pets_mismatch",
  "substance_use",
  "financial_instability",
  "long_distance",
];

const DEFAULT_SETTINGS_WEIGHTS: Record<MatchingTraitKey, number> = {
  emotional_profile: 30,
  communication_style: 22,
  commitment_readiness: 17,
  relationship_vision: 16,
  visual_taste: 15,
};

export const DEFAULT_PUBLISHED_MATCH_SETTINGS: PublishedMatchSettings = {
  versionId: "default",
  weights: DEFAULT_SETTINGS_WEIGHTS,
  hardFilters: DEFAULT_MATCHING_HARD_FILTERS,
  dealBreakerFilters: DEFAULT_DEAL_BREAKER_FILTERS,
};

const TRAIT_KEYS: MatchingTraitKey[] = [
  "emotional_profile",
  "communication_style",
  "commitment_readiness",
  "relationship_vision",
  "visual_taste",
];

const HARD_FILTER_KEYS = new Set<MatchingHardFilterKey>(DEFAULT_MATCHING_HARD_FILTERS);

export function parsePublishedMatchSettings(input: {
  id: string;
  weights?: Record<string, unknown> | null;
  hard_filters?: unknown;
  deal_breaker_filters?: unknown;
}): { ok: true; value: PublishedMatchSettings } | { ok: false; errors: { code: string; message: string }[] } {
  const errors: { code: string; message: string }[] = [];
  const weights = normalizeSettingsWeights(input.weights);
  const activeWeightTotal = Object.values(weights).reduce((sum, value) => sum + (value > 0 ? value : 0), 0);

  if (!input.id.trim()) {
    errors.push({ code: "version_id_required", message: "חסרה גרסת הגדרות התאמה." });
  }

  if (activeWeightTotal <= 0) {
    errors.push({ code: "weights_required", message: "לפחות משקל התאמה אחד חייב להיות פעיל." });
  }

  const hardFilters = parseHardFilters(input.hard_filters);
  if (hardFilters.some((key) => !HARD_FILTER_KEYS.has(key))) {
    errors.push({ code: "invalid_hard_filter", message: "הגדרת סינון קשיח אינה תקינה." });
  }

  const dealBreakerFilters = parseDealBreakerFilters(input.deal_breaker_filters);
  if (dealBreakerFilters.some((key) => !dealBreakerParticipatesInHardFilters(key))) {
    errors.push({ code: "invalid_deal_breaker_filter", message: "הגדרת דיל-ברייקר אינה תקינה." });
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      versionId: input.id,
      weights,
      hardFilters,
      dealBreakerFilters,
    },
  };
}

export function matchHardFiltersFromSettings(settings: PublishedMatchSettings): MatchHardFilters {
  const enabled = new Set(settings.hardFilters);

  return {
    disabled_profiles: true,
    blocked_users: true,
    gender_preference: enabled.has("gender"),
    reciprocal_age_range: enabled.has("age_range"),
    reciprocal_location_radius: enabled.has("distance"),
    relationship_intention: enabled.has("relationship_intention"),
    deal_breakers: enabled.has("deal_breakers"),
  };
}

export function normalizeSettingsWeights(weights: Record<string, unknown> | null | undefined): Record<MatchingTraitKey, number> {
  return Object.fromEntries(
    TRAIT_KEYS.map((traitKey) => [traitKey, Number(weights?.[traitKey] ?? 0)]),
  ) as Record<MatchingTraitKey, number>;
}

function parseHardFilters(value: unknown): MatchingHardFilterKey[] {
  if (Array.isArray(value)) {
    return uniqueStrings(value) as MatchingHardFilterKey[];
  }

  if (value && typeof value === "object") {
    const legacy = value as Record<string, unknown>;
    const filters: MatchingHardFilterKey[] = [];
    if (legacy.gender_preference) filters.push("gender");
    if (legacy.reciprocal_age_range) filters.push("age_range");
    if (legacy.reciprocal_location_radius) filters.push("distance");
    if (legacy.relationship_intention) filters.push("relationship_intention");
    if (legacy.deal_breakers) filters.push("deal_breakers");
    return filters;
  }

  return [];
}

function parseDealBreakerFilters(value: unknown) {
  return Array.isArray(value) ? uniqueStrings(value).map((key) => key.trim().toLowerCase()) : DEFAULT_DEAL_BREAKER_FILTERS;
}

function uniqueStrings(value: unknown[]) {
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}
