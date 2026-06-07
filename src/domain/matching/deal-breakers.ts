export type DealBreakerKey =
  | "smoking"
  | "wants_children_mismatch"
  | "religion_values_mismatch"
  | "political_values_mismatch"
  | "pets_mismatch"
  | "substance_use"
  | "financial_instability"
  | "long_distance"
  | "other";

export type DealBreakerOption = {
  key: DealBreakerKey;
  label: string;
  participatesInHardFilters: boolean;
};

export type CanonicalDealBreaker = {
  key: DealBreakerKey;
  label: string;
  otherText: string | null;
};

export const DEAL_BREAKER_OPTIONS: DealBreakerOption[] = [
  { key: "smoking", label: "עישון", participatesInHardFilters: true },
  { key: "wants_children_mismatch", label: "חוסר התאמה ברצון לילדים", participatesInHardFilters: true },
  { key: "religion_values_mismatch", label: "חוסר התאמה בדת או ערכים", participatesInHardFilters: true },
  { key: "political_values_mismatch", label: "חוסר התאמה בעמדות פוליטיות", participatesInHardFilters: true },
  { key: "pets_mismatch", label: "חוסר התאמה בנושא בעלי חיים", participatesInHardFilters: true },
  { key: "substance_use", label: "שימוש בחומרים", participatesInHardFilters: true },
  { key: "financial_instability", label: "חוסר יציבות כלכלית", participatesInHardFilters: true },
  { key: "long_distance", label: "מרחק גדול מדי", participatesInHardFilters: true },
  { key: "other", label: "אחר", participatesInHardFilters: false },
];

const optionsByKey = new Map(DEAL_BREAKER_OPTIONS.map((option) => [option.key, option]));
const aliasToKey = new Map<string, DealBreakerKey>(
  DEAL_BREAKER_OPTIONS.flatMap((option) => [
    [normalizeDealBreakerAlias(option.key), option.key],
    [normalizeDealBreakerAlias(option.label), option.key],
  ]),
);

const ENGLISH_DEAL_BREAKER_ALIASES: Array<[string, DealBreakerKey]> = [
  ["Smoking", "smoking"],
  ["Children plans mismatch", "wants_children_mismatch"],
  ["Religion or values mismatch", "religion_values_mismatch"],
  ["Political values mismatch", "political_values_mismatch"],
  ["Pets mismatch", "pets_mismatch"],
  ["Substance use", "substance_use"],
  ["Financial instability", "financial_instability"],
  ["Long distance", "long_distance"],
  ["Other", "other"],
];

for (const [alias, key] of ENGLISH_DEAL_BREAKER_ALIASES) {
  aliasToKey.set(normalizeDealBreakerAlias(alias), key);
}

export function canonicalizeDealBreakerKey(value: string): DealBreakerKey | null {
  return aliasToKey.get(normalizeDealBreakerAlias(value)) ?? null;
}

export function canonicalizeDealBreakerSubmission(input: {
  dealBreakers: unknown;
  otherDealBreakerText?: unknown;
}): CanonicalDealBreaker[] {
  const otherText = readOptionalText(input.otherDealBreakerText, 240);
  const seen = new Set<DealBreakerKey>();
  const result: CanonicalDealBreaker[] = [];

  if (!Array.isArray(input.dealBreakers)) {
    return result;
  }

  for (const value of input.dealBreakers) {
    const key = typeof value === "string" ? canonicalizeDealBreakerKey(value) : null;
    if (!key || seen.has(key)) {
      continue;
    }

    const option = optionsByKey.get(key);
    if (!option) {
      continue;
    }

    seen.add(key);
    result.push({
      key,
      label: option.label,
      otherText: key === "other" ? otherText : null,
    });
  }

  return result;
}

export function dealBreakerParticipatesInHardFilters(key: string) {
  const option = optionsByKey.get(key as DealBreakerKey);
  return option?.participatesInHardFilters ?? false;
}

function normalizeDealBreakerAlias(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function readOptionalText(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, maxLength) : null;
}
