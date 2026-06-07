export type CanSendMessageInput = {
  senderId: string;
  participants: [string, string];
  conversationStatus: "active" | "blocked" | "disabled";
  matchStatus: "active" | "hidden" | "blocked";
  blockedPairs: [string, string][];
};

export function canSendMessage(input: CanSendMessageInput): boolean {
  if (!input.participants.includes(input.senderId)) {
    return false;
  }

  if (input.conversationStatus !== "active" || input.matchStatus !== "active") {
    return false;
  }

  const [a, b] = input.participants;
  return !input.blockedPairs.some(
    ([blocker, blocked]) =>
      (blocker === a && blocked === b) || (blocker === b && blocked === a),
  );
}
