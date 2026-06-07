import { createGuestQuizSession } from "@/domain/quiz/session";
import { createQuizRepository } from "../repository";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const result = await createGuestQuizSession(createQuizRepository());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "לא ניתן ליצור שאלון." },
      { status: 500 },
    );
  }
}
