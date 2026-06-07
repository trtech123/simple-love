import { describe, expect, it } from "vitest";
import { canSendMessage } from "../../src/domain/chat/permissions";

describe("canSendMessage", () => {
  it("allows active matched conversation participants", () => {
    expect(
      canSendMessage({
        senderId: "a",
        conversationStatus: "active",
        matchStatus: "active",
        participants: ["a", "b"],
        blockedPairs: [],
      }),
    ).toBe(true);
  });

  it("rejects blocked conversations", () => {
    expect(
      canSendMessage({
        senderId: "a",
        conversationStatus: "blocked",
        matchStatus: "active",
        participants: ["a", "b"],
        blockedPairs: [],
      }),
    ).toBe(false);
  });

  it("rejects when either participant blocked the other", () => {
    expect(
      canSendMessage({
        senderId: "a",
        conversationStatus: "active",
        matchStatus: "active",
        participants: ["a", "b"],
        blockedPairs: [["b", "a"]],
      }),
    ).toBe(false);
  });
});
