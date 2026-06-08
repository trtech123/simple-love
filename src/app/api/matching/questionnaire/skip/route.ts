import { skipMatchingQuestionnaire } from "@/domain/matching/session";
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "../../auth";
import { createMatchingRepository } from "../../repository";

export const dynamic = "force-dynamic";

export async function POST() {
  const userId = await requireAuthenticatedUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in is required" }, { status: 401 });
  }

  try {
    return NextResponse.json(await skipMatchingQuestionnaire(createMatchingRepository(), userId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "לא ניתן לדלג על שאלון ההתאמות." },
      { status: 400 },
    );
  }
}
