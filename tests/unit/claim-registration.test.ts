import { describe, expect, it } from "vitest";
import {
  claimReportForUser,
  validateClaimForRegistration,
  type ClaimRegistrationRepository,
} from "../../src/domain/claims/claim-registration";
import { hashClaimToken } from "../../src/domain/claims/claim-token";

function createRepository(overrides: Partial<ClaimRegistrationRepository> = {}): ClaimRegistrationRepository {
  return {
    async getClaimByTokenHash(tokenHash) {
      if (tokenHash !== hashClaimToken("valid-token")) {
        return null;
      }

      return {
        id: "claim-1",
        quizSessionId: "session-1",
        reportId: "report-1",
        expiresAt: new Date("2026-06-03T12:00:00Z"),
        claimedAt: null,
        claimedBy: null,
        reportStatus: "completed",
      };
    },
    async completeClaim() {},
    ...overrides,
  };
}

describe("claim registration", () => {
  const now = new Date("2026-06-02T12:00:00Z");

  it("validates an unclaimed completed report token", async () => {
    const claim = await validateClaimForRegistration(createRepository(), "valid-token", now);

    expect(claim).toEqual({
      id: "claim-1",
      quizSessionId: "session-1",
      reportId: "report-1",
    });
  });

  it("rejects missing, expired, already claimed, and incomplete report tokens", async () => {
    await expect(validateClaimForRegistration(createRepository(), "missing-token", now)).rejects.toMatchObject({
      code: "not_found",
    });

    await expect(
      validateClaimForRegistration(
        createRepository({
          async getClaimByTokenHash() {
            return {
              id: "claim-1",
              quizSessionId: "session-1",
              reportId: "report-1",
              expiresAt: new Date("2026-06-01T12:00:00Z"),
              claimedAt: null,
              claimedBy: null,
              reportStatus: "completed",
            };
          },
        }),
        "valid-token",
        now,
      ),
    ).rejects.toMatchObject({ code: "expired" });

    await expect(
      validateClaimForRegistration(
        createRepository({
          async getClaimByTokenHash() {
            return {
              id: "claim-1",
              quizSessionId: "session-1",
              reportId: "report-1",
              expiresAt: new Date("2026-06-03T12:00:00Z"),
              claimedAt: new Date("2026-06-02T11:00:00Z"),
              claimedBy: "user-1",
              reportStatus: "completed",
            };
          },
        }),
        "valid-token",
        now,
      ),
    ).rejects.toMatchObject({ code: "already_claimed" });

    await expect(
      validateClaimForRegistration(
        createRepository({
          async getClaimByTokenHash() {
            return {
              id: "claim-1",
              quizSessionId: "session-1",
              reportId: "report-1",
              expiresAt: new Date("2026-06-03T12:00:00Z"),
              claimedAt: null,
              claimedBy: null,
              reportStatus: "generating",
            };
          },
        }),
        "valid-token",
        now,
      ),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("attaches the report and quiz session to the user before marking the token claimed", async () => {
    const updates: string[] = [];

    const result = await claimReportForUser(createRepository({
      async completeClaim(input) {
        updates.push(input.claimId, input.reportId, input.quizSessionId, input.userId, input.claimedAt.toISOString());
      },
    }), {
      claimToken: "valid-token",
      userId: "user-1",
      now,
    });

    expect(result).toEqual({ reportId: "report-1", quizSessionId: "session-1" });
    expect(updates).toEqual(["claim-1", "report-1", "session-1", "user-1", "2026-06-02T12:00:00.000Z"]);
  });

  it("treats a claim already attached to the same user as successful", async () => {
    let completed = false;

    const result = await claimReportForUser(createRepository({
      async getClaimByTokenHash() {
        return {
          id: "claim-1",
          quizSessionId: "session-1",
          reportId: "report-1",
          expiresAt: new Date("2026-06-03T12:00:00Z"),
          claimedAt: new Date("2026-06-02T11:00:00Z"),
          claimedBy: "user-1",
          reportStatus: "completed",
        };
      },
      async completeClaim() {
        completed = true;
      },
    }), {
      claimToken: "valid-token",
      userId: "user-1",
      now,
    });

    expect(result).toEqual({ reportId: "report-1", quizSessionId: "session-1" });
    expect(completed).toBe(false);
  });

  it("rejects a claim already attached to another user", async () => {
    await expect(
      claimReportForUser(createRepository({
        async getClaimByTokenHash() {
          return {
            id: "claim-1",
            quizSessionId: "session-1",
            reportId: "report-1",
            expiresAt: new Date("2026-06-03T12:00:00Z"),
            claimedAt: new Date("2026-06-02T11:00:00Z"),
            claimedBy: "other-user",
            reportStatus: "completed",
          };
        },
      }), {
        claimToken: "valid-token",
        userId: "user-1",
        now,
      }),
    ).rejects.toMatchObject({ code: "already_claimed" });
  });
});
