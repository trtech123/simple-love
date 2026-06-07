import { describe, expect, it } from "vitest";
import { mergeChatMessages } from "../../src/domain/chat/messages";

describe("chat message merging", () => {
  it("deduplicates messages by id and sorts by creation time", () => {
    const merged = mergeChatMessages(
      [
        { id: "message-2", conversationId: "c", senderId: "b", body: "second", createdAt: "2026-06-02T10:02:00.000Z" },
        { id: "message-1", conversationId: "c", senderId: "a", body: "first", createdAt: "2026-06-02T10:00:00.000Z" },
      ],
      [
        { id: "message-2", conversationId: "c", senderId: "b", body: "duplicate", createdAt: "2026-06-02T10:02:00.000Z" },
        { id: "message-3", conversationId: "c", senderId: "a", body: "third", createdAt: "2026-06-02T10:01:00.000Z" },
      ],
    );

    expect(merged.map((message) => message.id)).toEqual(["message-1", "message-3", "message-2"]);
    expect(merged.find((message) => message.id === "message-2")?.body).toBe("second");
  });
});
