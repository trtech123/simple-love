import { getQuizSessionSnapshot } from "@/domain/quiz/session";
import { createQuizRepository } from "../../repository";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  try {
    const { session, questionnaire } = await getQuizSessionSnapshot(createQuizRepository(), token);
    return NextResponse.json({
      publicToken: session.publicToken,
      status: session.status,
      answers: session.answers,
      questionnaire,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "לא ניתן לטעון את השאלון." },
      { status: error instanceof Error && error.message.includes("not found") ? 404 : 500 },
    );
  }
}
