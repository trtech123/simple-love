import { isE2eTestMode } from "@/lib/e2e-mode";
import { insertE2eInboundMessage, listE2eMessages } from "@/testing/e2e-chat-fixture";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const inboundMessageSchema = z.object({
  body: z.string().min(1),
  senderId: z.string().optional(),
});

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  if (!isE2eTestMode()) {
    return new NextResponse(null, { status: 404 });
  }

  const { conversationId } = await context.params;
  return NextResponse.json({ messages: await listE2eMessages(conversationId) });
}

export async function POST(request: Request, context: RouteContext) {
  if (!isE2eTestMode()) {
    return new NextResponse(null, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = inboundMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "תוכן ההודעה אינו תקין." }, { status: 400 });
  }

  const { conversationId } = await context.params;
  const message = insertE2eInboundMessage(conversationId, parsed.data);
  return NextResponse.json({ message });
}
