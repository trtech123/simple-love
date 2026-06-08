import type { MatchingTraitKey } from "@/domain/matching/types";

export type AiCoachSoftSignal = {
  traitKey: MatchingTraitKey;
  delta: number;
  rationale?: string;
};

export type AiCoachHardFilterSuggestion = {
  field: "preferredAgeMin" | "preferredAgeMax" | "preferredDistanceKm" | "relationshipIntention" | "dealBreakers";
  value: unknown;
  rationale?: string;
};

export type AiCoachTuningOutput = {
  reply: string;
  softSignals: AiCoachSoftSignal[];
  hardFilterSuggestions: AiCoachHardFilterSuggestion[];
};

const TRAIT_KEYS = new Set<MatchingTraitKey>([
  "emotional_profile",
  "communication_style",
  "commitment_readiness",
  "relationship_vision",
  "visual_taste",
]);

const HARD_FILTER_FIELDS = new Set<AiCoachHardFilterSuggestion["field"]>([
  "preferredAgeMin",
  "preferredAgeMax",
  "preferredDistanceKm",
  "relationshipIntention",
  "dealBreakers",
]);

export function parseAiCoachTuningOutput(input: unknown): AiCoachTuningOutput {
  if (!input || typeof input !== "object") {
    return neutralTuningOutput();
  }

  const record = input as Record<string, unknown>;
  const reply = readText(record.reply) ?? "אני איתך. אפשר להמשיך לספר לי מה חשוב לך בקשר.";
  const softSignals = Array.isArray(record.softSignals)
    ? record.softSignals.flatMap((item) => readSoftSignal(item))
    : [];
  const hardFilterSuggestions = Array.isArray(record.hardFilterSuggestions)
    ? record.hardFilterSuggestions.flatMap((item) => readHardFilterSuggestion(item))
    : [];

  return { reply, softSignals, hardFilterSuggestions };
}

export function neutralTuningOutput(reply = "אני איתך. אפשר להמשיך לספר לי מה חשוב לך בקשר."): AiCoachTuningOutput {
  return {
    reply,
    softSignals: [],
    hardFilterSuggestions: [],
  };
}

function readSoftSignal(input: unknown): AiCoachSoftSignal[] {
  if (!input || typeof input !== "object") return [];
  const record = input as Record<string, unknown>;
  const traitKey = readText(record.traitKey);
  const delta = typeof record.delta === "number" && Number.isFinite(record.delta) ? record.delta : null;

  if (!traitKey || !TRAIT_KEYS.has(traitKey as MatchingTraitKey) || delta === null) {
    return [];
  }

  return [
    {
      traitKey: traitKey as MatchingTraitKey,
      delta: Math.max(-15, Math.min(15, delta)),
      rationale: readText(record.rationale) ?? undefined,
    },
  ];
}

function readHardFilterSuggestion(input: unknown): AiCoachHardFilterSuggestion[] {
  if (!input || typeof input !== "object") return [];
  const record = input as Record<string, unknown>;
  const field = readText(record.field);

  if (!field || !HARD_FILTER_FIELDS.has(field as AiCoachHardFilterSuggestion["field"])) {
    return [];
  }

  return [
    {
      field: field as AiCoachHardFilterSuggestion["field"],
      value: record.value,
      rationale: readText(record.rationale) ?? undefined,
    },
  ];
}

function readText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}
