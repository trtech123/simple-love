import { isE2eTestMode } from "@/lib/e2e-mode";
import { resetE2eChatFixture } from "@/testing/e2e-chat-fixture";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(_request: Request) {
  if (!isE2eTestMode()) {
    return new NextResponse(null, { status: 404 });
  }

  resetE2eChatFixture();
  return NextResponse.json({ ok: true });
}
