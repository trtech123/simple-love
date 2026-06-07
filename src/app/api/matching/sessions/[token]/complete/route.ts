import { completeMatchingSession } from "@/domain/matching/session";
import { loadMatchProfiles, rerunMatchesForUser } from "@/domain/matching/rerun";
import { loadPublishedMatchSettings } from "@/domain/matching/settings-repository";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "../../../auth";
import { createMatchingRepository } from "../../../repository";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const userId = await requireAuthenticatedUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in is required" }, { status: 401 });
  }

  const { token } = await context.params;

  try {
    const result = await completeMatchingSession(createMatchingRepository(), userId, token);
    const supabase = createServiceRoleClient();

    try {
      const settings = await loadPublishedMatchSettings(supabase);
      const profiles = await loadMatchProfiles(supabase);
      const matchingRerun = await rerunMatchesForUser({ supabase, userId, settings, profiles });

      return NextResponse.json({
        ...result,
        matchingRerun: { ok: true, ...matchingRerun },
      });
    } catch {
      return NextResponse.json({
        ...result,
        matchingRerun: {
          ok: false,
          message: "השאלון נשמר, אבל חישוב ההתאמות יושלם בהמשך.",
        },
      });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "לא ניתן להשלים את שאלון ההתאמות." },
      { status: 400 },
    );
  }
}
