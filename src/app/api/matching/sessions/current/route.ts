import { getCurrentMatchingSession } from "@/domain/matching/session";
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "../../auth";
import { createMatchingRepository } from "../../repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireAuthenticatedUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in is required" }, { status: 401 });
  }

  try {
    const result = await getCurrentMatchingSession(createMatchingRepository(), userId);

    if (!result) {
      return NextResponse.json({ error: "No matching session exists" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes("matching profile")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "לא ניתן לטעון את שאלון ההתאמות." },
      { status: 500 },
    );
  }
}
