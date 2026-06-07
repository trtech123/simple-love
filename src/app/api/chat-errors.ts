import { ChatAccessError } from "@/domain/chat/conversations";
import { NextResponse } from "next/server";

export function chatErrorResponse(error: unknown) {
  if (error instanceof ChatAccessError) {
    return NextResponse.json(
      {
        error: error.code === "blocked" ? "אי אפשר לשלוח הודעות בהתאמה הזו." : error.message,
        code: error.code === "blocked" ? "conversation_blocked" : error.code,
      },
      { status: statusForChatError(error) },
    );
  }

  return NextResponse.json(
    { error: error instanceof Error ? error.message : "לא ניתן להשלים את בקשת השיחה." },
    { status: 400 },
  );
}

function statusForChatError(error: ChatAccessError) {
  if (error.code === "not_found") {
    return 404;
  }

  if (error.code === "invalid_body") {
    return 400;
  }

  if (error.code === "already_blocked") {
    return 409;
  }

  return 403;
}
