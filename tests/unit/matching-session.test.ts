import { describe, expect, it } from "vitest";
import {
  completeMatchingSession,
  createOrGetMatchingSession,
  saveMatchingAnswer,
  skipMatchingQuestionnaire,
  type MatchingSessionRepository,
} from "../../src/domain/matching/session";
import type { QuizQuestionnaire, QuizSessionRecord } from "../../src/domain/quiz/session";

const questionnaire: QuizQuestionnaire = {
  id: "matching-version-1",
  questions: [
    {
      id: "question-1",
      stableKey: "match_q01",
      questionType: "multiple_choice",
      options: [
        { id: "option-1-a", position: 1 },
        { id: "option-1-b", position: 4 },
      ],
    },
    {
      id: "question-2",
      stableKey: "match_q31",
      questionType: "multiple_choice",
      options: [
        { id: "option-2-a", position: 1 },
        { id: "option-2-b", position: 4 },
      ],
    },
  ],
};

function createRepository(existingSession?: QuizSessionRecord) {
  const sessions = new Map<string, QuizSessionRecord>();
  const generatedMatches: string[] = [];
  const skippedUsers: string[] = [];

  if (existingSession) {
    sessions.set(existingSession.publicToken, existingSession);
  }

  const repository: MatchingSessionRepository = {
    async getPublishedMatchingQuestionnaire() {
      return questionnaire;
    },
    async isMatchingProfileComplete() {
      return true;
    },
    async getLatestSessionForUser(userId) {
      return [...sessions.values()].find((session) => session.userId === userId) ?? null;
    },
    async createSession({ publicToken, questionnaireVersionId, userId }) {
      const session = {
        id: `${userId}-session`,
        publicToken,
        userId,
        questionnaireVersionId,
        status: "started" as const,
        answers: {},
      };
      sessions.set(publicToken, session);
      return session;
    },
    async getSessionByToken(publicToken) {
      return sessions.get(publicToken) ?? null;
    },
    async upsertAnswer({ sessionId, questionId, questionOptionId }) {
      const session = [...sessions.values()].find((candidate) => candidate.id === sessionId);
      if (session) {
        session.answers = { ...session.answers, [questionId]: questionOptionId };
      }
    },
    async markSessionCompleted(sessionId) {
      const session = [...sessions.values()].find((candidate) => candidate.id === sessionId);
      if (session) {
        session.status = "completed";
      }
    },
    async upsertTraitsAndGenerateMatches(userId) {
      generatedMatches.push(userId);
      return 3;
    },
    async skipQuestionnaireAndGenerateMatches(userId) {
      skippedUsers.push(userId);
      return 2;
    },
  };

  return { repository, sessions, generatedMatches, skippedUsers };
}

describe("matching session flow", () => {
  it("creates an authenticated matching session from the matching questionnaire", async () => {
    const { repository } = createRepository();

    const result = await createOrGetMatchingSession(repository, "user-1", {
      createToken: () => "matching-token",
    });

    expect(result).toMatchObject({
      publicToken: "matching-token",
      questionnaire: { id: "matching-version-1" },
      status: "started",
    });
  });

  it("rejects session creation until the matching profile is complete", async () => {
    const { repository } = createRepository();
    repository.isMatchingProfileComplete = async () => false;

    await expect(
      createOrGetMatchingSession(repository, "user-1", {
        createToken: () => "matching-token",
      }),
    ).rejects.toThrow("Complete your matching profile before starting the questionnaire");
  });

  it("rejects answer writes for another user's session token", async () => {
    const { repository } = createRepository({
      id: "user-2-session",
      publicToken: "matching-token",
      userId: "user-2",
      questionnaireVersionId: "matching-version-1",
      status: "started",
      answers: {},
    });

    await expect(
      saveMatchingAnswer(repository, "user-1", "matching-token", {
        questionId: "question-1",
        questionOptionId: "option-1-a",
      }),
    ).rejects.toThrow("Matching session does not belong to the current user");
  });

  it("rejects completion when required matching answers are missing", async () => {
    const { repository } = createRepository({
      id: "user-1-session",
      publicToken: "matching-token",
      userId: "user-1",
      questionnaireVersionId: "matching-version-1",
      status: "started",
      answers: { "question-1": "option-1-a" },
    });

    await expect(completeMatchingSession(repository, "user-1", "matching-token")).rejects.toThrow(
      "Missing 1 required answers",
    );
  });

  it("marks complete and generates matches after all required answers exist", async () => {
    const { repository, generatedMatches } = createRepository({
      id: "user-1-session",
      publicToken: "matching-token",
      userId: "user-1",
      questionnaireVersionId: "matching-version-1",
      status: "started",
      answers: { "question-1": "option-1-a", "question-2": "option-2-b" },
    });

    const result = await completeMatchingSession(repository, "user-1", "matching-token");

    expect(result).toEqual({ completed: true, matchCount: 3 });
    expect(generatedMatches).toEqual(["user-1"]);
  });

  it("requires a complete matching profile before skipping the depth questionnaire", async () => {
    const { repository } = createRepository();
    repository.isMatchingProfileComplete = async () => false;

    await expect(skipMatchingQuestionnaire(repository, "user-1")).rejects.toThrow(
      "Complete your matching profile before starting the questionnaire",
    );
  });

  it("marks the depth questionnaire complete and generates matches without questionnaire answers", async () => {
    const { repository, skippedUsers } = createRepository();

    const result = await skipMatchingQuestionnaire(repository, "user-1");

    expect(result).toEqual({ completed: true, matchCount: 2 });
    expect(skippedUsers).toEqual(["user-1"]);
  });

  it("allows repeated questionnaire skips to return the same completion shape", async () => {
    const { repository, skippedUsers } = createRepository();

    await expect(skipMatchingQuestionnaire(repository, "user-1")).resolves.toEqual({ completed: true, matchCount: 2 });
    await expect(skipMatchingQuestionnaire(repository, "user-1")).resolves.toEqual({ completed: true, matchCount: 2 });
    expect(skippedUsers).toEqual(["user-1", "user-1"]);
  });
});
