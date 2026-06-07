export type MatchProfile = {
  userId: string;
  birthYear?: number;
  preferredAgeMin?: number;
  preferredAgeMax?: number;
  gender?: string;
  interestedIn?: string;
  locationText?: string;
  locationLatitude?: number;
  locationLongitude?: number;
  preferredDistanceKm?: number;
  relationshipIntention?: string;
  dealBreakerKeys?: string[];
  blockedUserIds?: string[];
  disabled?: boolean;
  traits?: Record<string, number>;
};

export type WeightedScoreInput = {
  a: MatchProfile;
  b: MatchProfile;
  weights: Record<string, number>;
};

export type MatchingTraitKey =
  | "emotional_profile"
  | "communication_style"
  | "commitment_readiness"
  | "relationship_vision"
  | "visual_taste";

export type GeneratedMatch = {
  userA: string;
  userB: string;
  score: number;
  matchSettingsVersionId: string;
  explanation: {
    settingsVersionId: string;
    summary: string;
    traitScores: Partial<Record<MatchingTraitKey, number>>;
    logisticsScores: {
      reciprocalAgeFit: number;
      distanceFit: number;
      overall: number;
    };
    breakdown: {
      trait: number;
      logistics: number;
      final: number;
    };
    reasons: string[];
  };
};

export type MatchHardFilters = {
  disabled_profiles?: boolean;
  blocked_users?: boolean;
  gender_preference?: boolean;
  reciprocal_age_range?: boolean;
  reciprocal_location_radius?: boolean;
  relationship_intention?: boolean;
  deal_breakers?: boolean;
};
