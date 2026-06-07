import { validatePromptVersion } from "@/domain/admin/prompt-admin";
import { archiveVersionAction, createDraftVersionAction, publishVersionAction, saveDirectDraftVersionAction } from "./version-actions";

export function buildPromptPublishAction(versionId: string, actorUserId: string) {
  return { type: "prompt.publish" as const, versionId, actorUserId };
}

const promptConfig = {
  table: "prompt_versions",
  groupColumn: "slug",
  path: "/admin/prompts",
};

export async function publishPromptVersionAction(formData: FormData) {
  "use server";
  return publishVersionAction(formData, promptConfig);
}

export async function archivePromptVersionAction(formData: FormData) {
  "use server";
  return archiveVersionAction(formData, promptConfig);
}

export async function createPromptDraftVersionAction(formData: FormData) {
  "use server";
  return createDraftVersionAction(formData, {
    ...promptConfig,
    select: "id, slug, version, status, template, model, model_settings, created_at, published_at",
    editorPath: (versionId) => `/admin/prompts/${versionId}`,
  });
}

export async function savePromptDraftVersionAction(formData: FormData) {
  "use server";
  return saveDirectDraftVersionAction(formData, {
    ...promptConfig,
    editorPath: (versionId) => `/admin/prompts/${versionId}`,
    payload: (data) => {
      const prompt = validatePromptVersion({
        template: String(data.get("template") ?? ""),
        model: String(data.get("model") ?? ""),
        modelSettings: parseJsonObject(data.get("modelSettings"), "Model settings must be valid JSON"),
      });

      return {
        template: prompt.template,
        model: prompt.model,
        model_settings: prompt.modelSettings,
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
