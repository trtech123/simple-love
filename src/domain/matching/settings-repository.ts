import { parsePublishedMatchSettings, type PublishedMatchSettings } from "./settings";

type SupabaseLike = {
  from: (table: string) => any;
};

type MatchSettingsRow = {
  id: string;
  weights: Record<string, unknown> | null;
  hard_filters: unknown;
  deal_breaker_filters?: unknown;
};

export async function loadPublishedMatchSettings(supabase: SupabaseLike): Promise<PublishedMatchSettings> {
  const { data, error } = (await supabase
    .from("match_settings_versions")
    .select("id, weights, hard_filters, deal_breaker_filters")
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()) as { data: MatchSettingsRow | null; error: { message?: string } | null };

  if (error) {
    throw new Error(error.message ?? "Published match settings could not be loaded");
  }

  if (!data) {
    throw new Error("Published match settings are missing");
  }

  const parsed = parsePublishedMatchSettings(data);
  if (!parsed.ok) {
    throw new Error(parsed.errors.map((item) => item.message).join(" "));
  }

  return parsed.value;
}
