export type ProfileFormOption = {
  value: string;
  label: string;
};

export type ProfileFormConfig = {
  direction: "rtl";
  birthYear: {
    minAge: number;
    maxAge: number;
  };
  preferredAge: {
    min: number;
    max: number;
  };
  preferredDistanceKm: {
    min: number;
    max: number;
    default: number;
  };
  genderOptions: ProfileFormOption[];
  interestedInOptions: ProfileFormOption[];
  relationshipIntentions: ProfileFormOption[];
  dealBreakers: ProfileFormOption[];
};

export type PublicProfileFormConfigVersion = {
  versionId: string;
  version: number;
  config: ProfileFormConfig;
};

export const DEFAULT_PROFILE_FORM_CONFIG: ProfileFormConfig = {
  direction: "rtl",
  birthYear: {
    minAge: 18,
    maxAge: 120,
  },
  preferredAge: {
    min: 18,
    max: 120,
  },
  preferredDistanceKm: {
    min: 1,
    max: 500,
    default: 50,
  },
  genderOptions: [
    { value: "woman", label: "אישה" },
    { value: "man", label: "גבר" },
    { value: "non_binary", label: "א-בינארי" },
    { value: "other", label: "אחר" },
  ],
  interestedInOptions: [
    { value: "woman", label: "נשים" },
    { value: "man", label: "גברים" },
    { value: "everyone", label: "כולם" },
  ],
  relationshipIntentions: [
    { value: "serious", label: "קשר רציני" },
    { value: "long_term", label: "קשר ארוך טווח" },
    { value: "marriage", label: "חתונה ומשפחה" },
    { value: "open_to_explore", label: "פתוח/ה להכיר" },
  ],
  dealBreakers: [
    { value: "smoking", label: "עישון" },
    { value: "wants_children_mismatch", label: "חוסר התאמה ברצון לילדים" },
    { value: "religion_values_mismatch", label: "חוסר התאמה בדת או ערכים" },
    { value: "political_values_mismatch", label: "חוסר התאמה בעמדות פוליטיות" },
    { value: "pets_mismatch", label: "חוסר התאמה בנושא בעלי חיים" },
    { value: "substance_use", label: "שימוש בחומרים" },
    { value: "financial_instability", label: "חוסר יציבות כלכלית" },
    { value: "long_distance", label: "מרחק גדול מדי" },
    { value: "other", label: "אחר" },
  ],
};

export function parseProfileFormConfig(input: unknown): ProfileFormConfig {
  if (!input || typeof input !== "object") {
    throw new Error("Profile form config is required");
  }

  const record = input as Record<string, unknown>;
  if (record.direction !== "rtl") {
    throw new Error("Profile form config direction must be rtl");
  }

  const config: ProfileFormConfig = {
    direction: "rtl",
    birthYear: readRangeObject(record.birthYear, "birthYear", ["minAge", "maxAge"]),
    preferredAge: readRangeObject(record.preferredAge, "preferredAge", ["min", "max"]),
    preferredDistanceKm: readDistanceObject(record.preferredDistanceKm),
    genderOptions: readOptions(record.genderOptions, "genderOptions"),
    interestedInOptions: readOptions(record.interestedInOptions, "interestedInOptions"),
    relationshipIntentions: readOptions(record.relationshipIntentions, "relationshipIntentions"),
    dealBreakers: readOptions(record.dealBreakers, "dealBreakers"),
  };

  if (config.birthYear.minAge < 18 || config.birthYear.maxAge < config.birthYear.minAge) {
    throw new Error("birthYear range is invalid");
  }

  if (config.preferredAge.min < 18 || config.preferredAge.max < config.preferredAge.min) {
    throw new Error("preferredAge range is invalid");
  }

  if (
    config.preferredDistanceKm.min < 1 ||
    config.preferredDistanceKm.max < config.preferredDistanceKm.min ||
    config.preferredDistanceKm.default < config.preferredDistanceKm.min ||
    config.preferredDistanceKm.default > config.preferredDistanceKm.max
  ) {
    throw new Error("preferredDistanceKm range is invalid");
  }

  return config;
}

export function projectPublicProfileFormConfig(input: {
  id: string;
  version: number;
  config: unknown;
}) {
  return {
    versionId: input.id,
    version: input.version,
    config: parseProfileFormConfig(input.config),
  };
}

function readRangeObject<TKey extends string>(
  value: unknown,
  name: string,
  keys: [TKey, TKey],
): Record<TKey, number> {
  if (!value || typeof value !== "object") {
    throw new Error(`${name} is required`);
  }

  const record = value as Record<string, unknown>;
  const first = readInteger(record[keys[0]], `${name}.${keys[0]}`);
  const second = readInteger(record[keys[1]], `${name}.${keys[1]}`);
  return { [keys[0]]: first, [keys[1]]: second } as Record<TKey, number>;
}

function readDistanceObject(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new Error("preferredDistanceKm is required");
  }

  const record = value as Record<string, unknown>;
  return {
    min: readInteger(record.min, "preferredDistanceKm.min"),
    max: readInteger(record.max, "preferredDistanceKm.max"),
    default: readInteger(record.default, "preferredDistanceKm.default"),
  };
}

function readOptions(value: unknown, name: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${name} must include at least one option`);
  }

  const seen = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`${name}.${index} is invalid`);
    }

    const record = item as Record<string, unknown>;
    const option = {
      value: readText(record.value, `${name}.${index}.value`, 80),
      label: readText(record.label, `${name}.${index}.label`, 120),
    };

    if (seen.has(option.value)) {
      throw new Error(`Duplicate option value "${option.value}" in ${name}`);
    }

    seen.add(option.value);
    return option;
  });
}

function readInteger(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }

  return value;
}

function readText(value: unknown, name: string, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw new Error(`${name} is required`);
  }

  if (text.length > maxLength) {
    throw new Error(`${name} is too long`);
  }

  return text;
}
