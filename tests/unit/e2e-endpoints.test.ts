import { describe, expect, it, vi } from "vitest";

describe("e2e endpoints", () => {
  it("return 404 when e2e mode is disabled", async () => {
    vi.resetModules();
    delete process.env.E2E_TEST_MODE;

    const resetRoute = await import("../../src/app/api/e2e/chat-fixture/reset/route");
    const messagesRoute = await import("../../src/app/api/e2e/conversations/[conversationId]/messages/route");

    const resetResponse = await resetRoute.POST(new Request("http://localhost/api/e2e/chat-fixture/reset"));
    const getResponse = await messagesRoute.GET(new Request("http://localhost/api/e2e/conversations/conversation-1/messages"), {
      params: Promise.resolve({ conversationId: "conversation-1" }),
    });
    const postResponse = await messagesRoute.POST(
      new Request("http://localhost/api/e2e/conversations/conversation-1/messages", {
        method: "POST",
        body: JSON.stringify({ body: "Inbound" }),
      }),
      { params: Promise.resolve({ conversationId: "conversation-1" }) },
    );

    expect(resetResponse.status).toBe(404);
    expect(getResponse.status).toBe(404);
    expect(postResponse.status).toBe(404);
  });
});
