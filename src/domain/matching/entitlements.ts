export type MatchesGate =
  | "profile_required"
  | "depth_questionnaire_required"
  | "payment_required"
  | "unlocked";

export function resolveMatchesGate(input: {
  hasProfile: boolean;
  matchingProfileComplete: boolean;
  completedDepthQuestionnaireAt: string | null;
  hasMatchingEntitlement: boolean;
}): MatchesGate {
  if (!input.hasProfile || !input.matchingProfileComplete) {
    return "profile_required";
  }

  if (!input.completedDepthQuestionnaireAt) {
    return "depth_questionnaire_required";
  }

  return input.hasMatchingEntitlement ? "unlocked" : "payment_required";
}
