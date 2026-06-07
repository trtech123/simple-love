import { saveMatchingAnswer } from "@/domain/matching/session";
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "../../../auth";
import { createMatchingRepository } from "../../../repository";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const userId = await requireAuthenticatedUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in is required" }, { status: 401 });
  }

  const { token } = await context.params;
  const body = await request.json().catch(() => null);

  if (!body || typeof body.questionId !== "string" || typeof body.questionOptionId !== "string") {
    return NextResponse.json({ error: "questionId and questionOptionId are required" }, { status: 400 });
  }

  try {
    await saveMatchingAnswer(createMatchingRepository(), userId, token, {
      questionId: body.questionId,
      questionOptionId: body.questionOptionId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "לא ניתן לשמור את תשובת ההתאמה." },
      { status: 400 },
    );
  }
}
