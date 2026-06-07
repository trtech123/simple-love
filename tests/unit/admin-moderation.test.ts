import { describe, expect, it } from "vitest";
import { canDisableConversation, canDisableUser } from "../../src/domain/admin/moderation-admin";

describe("moderation admin rules", () => {
  it("allows disabling active conversations", () => {
    expect(canDisableConversation({ status: "active" })).toBe(true);
  });

  it("does not disable an already disabled conversation", () => {
    expect(canDisableConversation({ status: "disabled" })).toBe(false);
  });

  it("allows disabling enabled users", () => {
    expect(canDisableUser({ disabledAt: null })).toBe(true);
    expect(canDisableUser({ disabledAt: new Date("2026-06-02T00:00:00Z") })).toBe(false);
  });
});
