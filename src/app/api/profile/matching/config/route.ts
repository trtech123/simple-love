import { apiError, apiSuccess } from "@/app/api/envelope";
import {
  DEFAULT_PROFILE_FORM_CONFIG,
  parseProfileFormConfig,
  projectPublicProfileFormConfig,
} from "@/domain/matching/profile-form-config";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type ProfileFormConfigVersionRow = {
  id: string;
  version: number;
  status: string;
  config: unknown;
};

export async function GET() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("profile_form_config_versions")
    .select("id, version, status, config")
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<ProfileFormConfigVersionRow>();

  if (error) {
    if (isConfigTableUnavailable(error)) {
      return apiSuccess({
        versionId: "default-code",
        version: 1,
        config: DEFAULT_PROFILE_FORM_CONFIG,
      });
    }

    return apiError({
      status: 503,
      code: "schema_unavailable",
      message: "הגדרת טופס הפרופיל אינה זמינה כרגע.",
    });
  }

  if (!data) {
    return apiSuccess({
      versionId: "default-code",
      version: 1,
      config: DEFAULT_PROFILE_FORM_CONFIG,
    });
  }

  try {
    parseProfileFormConfig(data.config);
    return apiSuccess(projectPublicProfileFormConfig(data));
  } catch (error) {
    return apiError({
      status: 503,
      code: "published_config_invalid",
      message: "הגדרת טופס הפרופיל שפורסמה אינה תקינה.",
      details: { reason: error instanceof Error ? error.message : "הגדרת הטופס אינה תקינה." },
    });
  }
}

function isConfigTableUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? "");
  return /does not exist|schema cache|relation .*profile_form_config_versions/i.test(message);
}
