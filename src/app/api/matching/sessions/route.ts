import { createOrGetMatchingSession } from "@/domain/matching/session";
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "../auth";
import { createMatchingRepository } from "../repository";

export const dynamic = "force-dynamic";

export async function POST() {
  const userId = await requireAuthenticatedUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in is required" }, { status: 401 });
  }

  try {
    const result = await createOrGetMatchingSession(createMatchingRepository(), userId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes("matching profile")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "לא ניתן ליצור שאלון התאמות." },
      { status: 500 },
    );
  }
}
