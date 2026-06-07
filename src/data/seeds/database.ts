import type { SupabaseClient } from "@supabase/supabase-js";
import { seedPublishedMatchingQuestionnaire, seedPublishedReportQuestionnaire } from "@/domain/quiz/supabase-repository";
import { archetypeSeeds } from "./archetypes";
import { reportPromptSeed } from "./report-prompt";

export async function seedOperationalData(supabase: SupabaseClient) {
  const questionnaireVersionId = await seedPublishedReportQuestionnaire(supabase);
  const matchingQuestionnaireVersionId = await seedPublishedMatchingQuestionnaire(supabase);
  const promptVersionId = await seedPublishedPrompt(supabase);
  const archetypeVersionIds = await seedPublishedArchetypes(supabase);

  return {
    questionnaireVersionId,
    matchingQuestionnaireVersionId,
    promptVersionId,
    archetypeVersionIds,
  };
}

async function seedPublishedPrompt(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("prompt_versions")
    .upsert(
      {
        slug: reportPromptSeed.slug,
        version: reportPromptSeed.version,
        status: reportPromptSeed.status,
        template: reportPromptSeed.template,
        model: reportPromptSeed.model,
        model_settings: reportPromptSeed.modelSettings,
        published_at: new Date().toISOString(),
      },
      { onConflict: "slug,version" },
    )
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  return data.id;
}

async function seedPublishedArchetypes(supabase: SupabaseClient) {
  const versionIds: string[] = [];

  for (const seed of archetypeSeeds) {
    const { data: archetype, error: archetypeError } = await supabase
      .from("archetypes")
      .upsert({ stable_key: seed.stableKey }, { onConflict: "stable_key" })
      .select("id")
      .single<{ id: string }>();

    if (archetypeError) {
      throw new Error(archetypeError.message);
    }

    const { data: version, error: versionError } = await supabase
      .from("archetype_versions")
      .upsert(
        {
          archetype_id: archetype.id,
          version: 1,
          status: "published",
          name: seed.name,
          short_description: seed.shortDescription,
          full_description: seed.shortDescription,
          matching_meaning: seed.matchingMeaning,
          scoring_rules: {},
          published_at: new Date().toISOString(),
        },
        { onConflict: "archetype_id,version" },
      )
      .select("id")
      .single<{ id: string }>();

    if (versionError) {
      throw new Error(versionError.message);
    }

    versionIds.push(version.id);
  }

  return versionIds;
}
