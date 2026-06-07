export function canDisableConversation(input: { status: "active" | "blocked" | "disabled" }) {
  return input.status !== "disabled";
}

export function canDisableUser(input: { disabledAt: Date | null }) {
  return input.disabledAt === null;
}
