import { validateArchetypeVersion } from "@/domain/admin/archetype-admin";
import { archiveVersionAction, createDraftVersionAction, publishVersionAction, saveDirectDraftVersionAction } from "./version-actions";

const archetypeConfig = {
  table: "archetype_versions",
  groupColumn: "archetype_id",
  path: "/admin/archetypes",
};

export async function publishArchetypeVersionAction(formData: FormData) {
  "use server";
  return publishVersionAction(formData, archetypeConfig);
}

export async function archiveArchetypeVersionAction(formData: FormData) {
  "use server";
  return archiveVersionAction(formData, archetypeConfig);
}

export async function createArchetypeDraftVersionAction(formData: FormData) {
  "use server";
  return createDraftVersionAction(formData, {
    ...archetypeConfig,
    select:
      "id, archetype_id, version, status, name, short_description, full_description, matching_meaning, scoring_rules, created_at, published_at",
    editorPath: (versionId) => `/admin/archetypes/${versionId}`,
  });
}

export async function saveArchetypeDraftVersionAction(formData: FormData) {
  "use server";
  return saveDirectDraftVersionAction(formData, {
    ...archetypeConfig,
    editorPath: (versionId) => `/admin/archetypes/${versionId}`,
    payload: (data) => {
      const archetype = validateArchetypeVersion({
        name: String(data.get("name") ?? ""),
        shortDescription: String(data.get("shortDescription") ?? ""),
        fullDescription: String(data.get("fullDescription") ?? ""),
        matchingMeaning: String(data.get("matchingMeaning") ?? ""),
        scoringRules: parseJsonObject(data.get("scoringRules"), "Scoring rules must be valid JSON"),
      });

      return {
        name: archetype.name,
        short_description: archetype.shortDescription,
        full_description: archetype.fullDescription,
        matching_meaning: archetype.matchingMeaning,
        scoring_rules: archetype.scoringRules,
      };
    },
  });
}

function parseJsonObject(value: FormDataEntryValue | null, message: string) {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(message);
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(message);
  }
}
