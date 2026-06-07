import { completeQuizSession } from "@/domain/quiz/session";
import { createQuizRepository } from "../../../repository";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  try {
    const result = await completeQuizSession(createQuizRepository(), token);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "לא ניתן להשלים את השאלון." },
      { status: 400 },
    );
  }
}
