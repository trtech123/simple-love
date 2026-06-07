import { validateMatchSettings } from "@/domain/admin/match-settings-admin";
import { archiveVersionAction, createDraftVersionAction, publishVersionAction, saveDirectDraftVersionAction } from "./version-actions";

export function buildMatchSettingsPublishAction(versionId: string, actorUserId: string) {
  return { type: "match_settings.publish" as const, versionId, actorUserId };
}

const matchSettingsConfig = {
  table: "match_settings_versions",
  groupColumn: "match_settings_id",
  path: "/admin/matching",
};

export async function publishMatchSettingsVersionAction(formData: FormData) {
  "use server";
  return publishVersionAction(formData, matchSettingsConfig);
}

export async function archiveMatchSettingsVersionAction(formData: FormData) {
  "use server";
  return archiveVersionAction(formData, matchSettingsConfig);
}

export async function createMatchSettingsDraftVersionAction(formData: FormData) {
  "use server";
  return createDraftVersionAction(formData, {
    ...matchSettingsConfig,
    select: "id, match_settings_id, version, status, weights, hard_filters, created_at, published_at",
    editorPath: (versionId) => `/admin/matching/${versionId}`,
  });
}

export async function saveMatchSettingsDraftVersionAction(formData: FormData) {
  "use server";
  return saveDirectDraftVersionAction(formData, {
    ...matchSettingsConfig,
    editorPath: (versionId) => `/admin/matching/${versionId}`,
    payload: (data) => {
      const settings = validateMatchSettings({
        weights: parseNumberRecord(data.get("weights"), "Weights must be valid JSON"),
        hardFilters: parseStringArray(data.get("hardFilters"), "Hard filters must be valid JSON"),
      });

      return {
        weights: settings.weights,
        hard_filters: settings.hardFilters,
      };
    },
  });
}

function parseNumberRecord(value: FormDataEntryValue | null, message: string) {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(message);
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([key, numberValue]) => [key, Number(numberValue)]),
    );
  } catch {
    throw new Error(message);
  }
}

function parseStringArray(value: FormDataEntryValue | null, message: string) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) {
      throw new Error(message);
    }
    return parsed.map((item) => String(item)).filter((item) => item.trim().length > 0);
  } catch {
    throw new Error(message);
  }
}
