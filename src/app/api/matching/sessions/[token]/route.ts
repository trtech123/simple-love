import { getCurrentMatchingSession } from "@/domain/matching/session";
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "../../auth";
import { createMatchingRepository } from "../../repository";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const userId = await requireAuthenticatedUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in is required" }, { status: 401 });
  }

  const { token } = await context.params;

  try {
    const session = await createMatchingRepository().getSessionByToken(token);

    if (!session || session.userId !== userId) {
      return NextResponse.json({ error: "Matching session was not found" }, { status: 404 });
    }

    const current = await getCurrentMatchingSession(createMatchingRepository(), userId);
    return current ? NextResponse.json(current) : NextResponse.json({ error: "No matching session exists" }, { status: 404 });
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
