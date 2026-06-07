import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchingSessionRepository } from "../../src/domain/matching/session";
import type { QuizQuestionnaire, QuizSessionRecord } from "../../src/domain/quiz/session";

const questionnaire: QuizQuestionnaire = {
  id: "matching-version-1",
  title: "Matching",
  questions: [
    {
      id: "question-1",
      stableKey: "match_q01",
      prompt: "Question 1",
      questionType: "multiple_choice",
      position: 1,
      options: [
        { id: "option-1-a", label: "A", value: "a", position: 1 },
        { id: "option-1-b", label: "B", value: "b", position: 2 },
      ],
    },
    {
      id: "question-2",
      stableKey: "match_q31",
      prompt: "Question 2",
      questionType: "multiple_choice",
      position: 2,
      options: [
        { id: "option-2-a", label: "A", value: "a", position: 1 },
        { id: "option-2-b", label: "B", value: "b", position: 2 },
      ],
    },
  ],
};

const state = {
  userId: "user-1" as string | null,
  repository: createRepository({ "question-1": "option-1-a", "question-2": "option-2-a" }, 2),
  rerunFails: false,
};

vi.mock("@/app/api/matching/auth", () => ({
  requireAuthenticatedUserId: async () => state.userId,
}));

vi.mock("@/app/api/matching/repository", () => ({
  createMatchingRepository: () => state.repository,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: () => ({ from: () => ({}) }),
}));

vi.mock("@/domain/matching/settings-repository", () => ({
  loadPublishedMatchSettings: vi.fn(() =>
    Promise.resolve({
      versionId: "settings-v2",
      weights: { emotional_profile: 100, communication_style: 0, commitment_readiness: 0, relationship_vision: 0 },
      hardFilters: [],
      dealBreakerFilters: [],
    }),
  ),
}));

vi.mock("@/domain/matching/rerun", () => ({
  loadMatchProfiles: vi.fn(() => Promise.resolve([])),
  rerunMatchesForUser: vi.fn(() => {
    if (state.rerunFails) {
      return Promise.reject(new Error("rerun failed"));
    }
    return Promise.resolve({ recalculated: 1, settingsVersionId: "settings-v2" });
  }),
}));

function createRepository(answers: Record<string, string>, matchCount: number): MatchingSessionRepository {
  const session: QuizSessionRecord = {
    id: "session-1",
    publicToken: "matching-token",
    userId: "user-1",
    questionnaireVersionId: "matching-version-1",
    status: "started",
    answers,
  };

  return {
    async getPublishedMatchingQuestionnaire() {
      return questionnaire;
    },
    async isMatchingProfileComplete() {
      return true;
    },
    async getLatestSessionForUser() {
      return session;
    },
    async createSession() {
      return session;
    },
    async getSessionByToken(publicToken) {
      return publicToken === "matching-token" ? session : null;
    },
    async upsertAnswer() {},
    async markSessionCompleted() {
      session.status = "completed";
    },
    async upsertTraitsAndGenerateMatches() {
      return matchCount;
    },
  };
}

async function postComplete(token = "matching-token") {
  const { POST } = await import("../../src/app/api/matching/sessions/[token]/complete/route");

  return POST(new Request(`http://localhost/api/matching/sessions/${token}/complete`, { method: "POST" }), {
    params: Promise.resolve({ token }),
  });
}

describe("POST /api/matching/sessions/[token]/complete", () => {
  beforeEach(() => {
    state.userId = "user-1";
    state.repository = createRepository({ "question-1": "option-1-a", "question-2": "option-2-a" }, 2);
    state.rerunFails = false;
  });

  it("returns the matching completion response for an authenticated user", async () => {
    const { loadPublishedMatchSettings } = await import("../../src/domain/matching/settings-repository");
    const { rerunMatchesForUser } = await import("../../src/domain/matching/rerun");
    const response = await postComplete();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      completed: true,
      matchCount: 2,
      matchingRerun: { ok: true, recalculated: 1, settingsVersionId: "settings-v2" },
    });
    expect(loadPublishedMatchSettings).toHaveBeenCalled();
    expect(rerunMatchesForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        settings: expect.objectContaining({ versionId: "settings-v2" }),
      }),
    );
  });

  it("keeps completion successful when post-completion rerun fails", async () => {
    state.rerunFails = true;

    const response = await postComplete();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      completed: true,
      matchCount: 2,
      matchingRerun: { ok: false, message: "השאלון נשמר, אבל חישוב ההתאמות יושלם בהמשך." },
    });
  });

  it("returns 401 when the user is not authenticated", async () => {
    state.userId = null;

    const response = await postComplete();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Sign in is required" });
  });

  it("returns the existing missing-answer error when required answers are absent", async () => {
    state.repository = createRepository({ "question-1": "option-1-a" }, 0);

    const response = await postComplete();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing 1 required answers" });
  });
});
