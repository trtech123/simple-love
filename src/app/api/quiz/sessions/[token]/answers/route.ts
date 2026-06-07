import { saveQuizAnswer } from "@/domain/quiz/session";
import { createQuizRepository } from "../../../repository";
import { NextResponse } from "next/server";

export async function PUT(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const body = await request.json().catch(() => null);

  if (!body || typeof body.questionId !== "string" || typeof body.questionOptionId !== "string") {
    return NextResponse.json({ error: "questionId and questionOptionId are required" }, { status: 400 });
  }

  try {
    await saveQuizAnswer(createQuizRepository(), token, {
      questionId: body.questionId,
      questionOptionId: body.questionOptionId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "לא ניתן לשמור את התשובה." },
      { status: 400 },
    );
  }
}
