import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchingSessionRepository } from "../../src/domain/matching/session";
import type { QuizQuestionnaire, QuizSessionRecord } from "../../src/domain/quiz/session";

const questionnaire: QuizQuestionnaire = {
  id: "matching-version-1",
  title: "Matching",
  questions: [],
};

const state = {
  userId: "user-1" as string | null,
  profileComplete: true,
  matchCount: 2,
};

vi.mock("@/app/api/matching/auth", () => ({
  requireAuthenticatedUserId: async () => state.userId,
}));

vi.mock("@/app/api/matching/repository", () => ({
  createMatchingRepository: () => createRepository(),
}));

function createRepository(): MatchingSessionRepository {
  return {
    async getPublishedMatchingQuestionnaire() {
      return questionnaire;
    },
    async isMatchingProfileComplete() {
      return state.profileComplete;
    },
    async getLatestSessionForUser() {
      return null;
    },
    async createSession(): Promise<QuizSessionRecord> {
      throw new Error("Skip should not create a questionnaire session");
    },
    async getSessionByToken() {
      return null;
    },
    async upsertAnswer() {},
    async markSessionCompleted() {},
    async upsertTraitsAndGenerateMatches() {
      throw new Error("Skip should not require questionnaire answers");
    },
    async skipQuestionnaireAndGenerateMatches() {
      return state.matchCount;
    },
  };
}

async function postSkip() {
  const { POST } = await import("../../src/app/api/matching/questionnaire/skip/route");

  return POST();
}

describe("POST /api/matching/questionnaire/skip", () => {
  beforeEach(() => {
    vi.resetModules();
    state.userId = "user-1";
    state.profileComplete = true;
    state.matchCount = 2;
  });

  it("returns 401 when the user is not authenticated", async () => {
    state.userId = null;

    const response = await postSkip();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Sign in is required" });
  });

  it("returns 400 when the matching profile is incomplete", async () => {
    state.profileComplete = false;

    const response = await postSkip();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Complete your matching profile before starting the questionnaire",
    });
  });

  it("marks the questionnaire skipped and returns a match count", async () => {
    state.matchCount = 4;

    const response = await postSkip();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ completed: true, matchCount: 4 });
  });
});
