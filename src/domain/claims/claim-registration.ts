import { canClaimToken, hashClaimToken } from "./claim-token";

export type ClaimForRegistration = {
  id: string;
  quizSessionId: string;
  reportId: string;
  expiresAt: Date;
  claimedAt: Date | null;
  claimedBy: string | null;
  reportStatus: string;
};

export type ClaimRegistrationRepository = {
  getClaimByTokenHash(tokenHash: string): Promise<ClaimForRegistration | null>;
  completeClaim(input: {
    claimId: string;
    reportId: string;
    quizSessionId: string;
    userId: string;
    claimedAt: Date;
  }): Promise<void>;
};

export type ClaimRegistrationErrorCode = "not_found" | "expired" | "already_claimed";

export class ClaimRegistrationError extends Error {
  constructor(
    public readonly code: ClaimRegistrationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ClaimRegistrationError";
  }
}

export async function validateClaimForRegistration(
  repository: ClaimRegistrationRepository,
  claimToken: string,
  now: Date,
) {
  const claim = await repository.getClaimByTokenHash(hashClaimToken(claimToken));

  if (!claim || claim.reportStatus !== "completed") {
    throw new ClaimRegistrationError("not_found", "Claim token was not found");
  }

  if (claim.claimedAt || claim.claimedBy) {
    throw new ClaimRegistrationError("already_claimed", "Claim token has already been claimed");
  }

  if (!canClaimToken({ expiresAt: claim.expiresAt, claimedAt: claim.claimedAt }, now)) {
    throw new ClaimRegistrationError("expired", "Claim token has expired");
  }

  return {
    id: claim.id,
    quizSessionId: claim.quizSessionId,
    reportId: claim.reportId,
  };
}

export async function validateClaimForAuthenticatedUser(
  repository: ClaimRegistrationRepository,
  input: {
    claimToken: string;
    userId: string;
    now: Date;
  },
) {
  const claim = await repository.getClaimByTokenHash(hashClaimToken(input.claimToken));

  if (!claim || claim.reportStatus !== "completed") {
    throw new ClaimRegistrationError("not_found", "Claim token was not found");
  }

  if (claim.claimedAt || claim.claimedBy) {
    if (claim.claimedBy === input.userId) {
      return {
        id: claim.id,
        quizSessionId: claim.quizSessionId,
        reportId: claim.reportId,
        alreadyClaimedByUser: true,
      };
    }

    throw new ClaimRegistrationError("already_claimed", "Claim token has already been claimed");
  }

  if (!canClaimToken({ expiresAt: claim.expiresAt, claimedAt: claim.claimedAt }, input.now)) {
    throw new ClaimRegistrationError("expired", "Claim token has expired");
  }

  return {
    id: claim.id,
    quizSessionId: claim.quizSessionId,
    reportId: claim.reportId,
    alreadyClaimedByUser: false,
  };
}

export async function claimReportForUser(
  repository: ClaimRegistrationRepository,
  input: {
    claimToken: string;
    userId: string;
    now: Date;
  },
) {
  const claim = await validateClaimForAuthenticatedUser(repository, input);

  if (claim.alreadyClaimedByUser) {
    return {
      reportId: claim.reportId,
      quizSessionId: claim.quizSessionId,
    };
  }

  await repository.completeClaim({
    claimId: claim.id,
    reportId: claim.reportId,
    quizSessionId: claim.quizSessionId,
    userId: input.userId,
    claimedAt: input.now,
  });

  return {
    reportId: claim.reportId,
    quizSessionId: claim.quizSessionId,
  };
}
