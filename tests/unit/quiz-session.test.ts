import { describe, expect, it } from "vitest";
import {
  completeQuizSession,
  createBrowserSafePublicToken,
  createGuestQuizSession,
  saveQuizAnswer,
  validateCompleteQuizAnswers,
  type QuizQuestionnaire,
  type QuizRepository,
  type QuizSessionRecord,
} from "../../src/domain/quiz/session";

const publishedQuestionnaire: QuizQuestionnaire = {
  id: "version-1",
  questions: Array.from({ length: 22 }, (_, index) => ({
    id: `question-${index + 1}`,
    questionType: "multiple_choice",
    options: [
      { id: `option-${index + 1}-a` },
      { id: `option-${index + 1}-b` },
    ],
  })),
};

function createMemoryRepository(questionnaire: QuizQuestionnaire | null = publishedQuestionnaire) {
  const sessions = new Map<string, QuizSessionRecord>();
  const answers = new Map<string, Map<string, string>>();

  const repository: QuizRepository = {
    async getPublishedReportQuestionnaire() {
      return questionnaire;
    },
    async createSession({ publicToken, questionnaireVersionId }) {
      const session = {
        id: `session-${sessions.size + 1}`,
        publicToken,
        questionnaireVersionId,
        status: "started" as const,
        answers: {},
      };
      sessions.set(publicToken, session);
      answers.set(session.id, new Map());
      return session;
    },
    async getSessionByToken(publicToken) {
      const session = sessions.get(publicToken);
      if (!session) {
        return null;
      }
      return {
        ...session,
        answers: Object.fromEntries(answers.get(session.id)?.entries() ?? []),
      };
    },
    async upsertAnswer({ sessionId, questionId, questionOptionId }) {
      answers.get(sessionId)?.set(questionId, questionOptionId);
    },
    async markSessionCompleted(sessionId) {
      for (const session of sessions.values()) {
        if (session.id === sessionId) {
          session.status = "completed";
        }
      }
    },
  };

  return repository;
}

describe("quiz session flow", () => {
  it("rejects quiz completion when a required answer is missing", () => {
    const result = validateCompleteQuizAnswers({
      requiredQuestionIds: publishedQuestionnaire.questions.map((question) => question.id),
      answeredQuestionIds: publishedQuestionnaire.questions.slice(0, 21).map((question) => question.id),
    });

    expect(result.ok).toBe(false);
    expect(result.missingQuestionIds).toEqual(["question-22"]);
  });

  it("accepts quiz completion when all 22 required answers exist", () => {
    const result = validateCompleteQuizAnswers({
      requiredQuestionIds: publishedQuestionnaire.questions.map((question) => question.id),
      answeredQuestionIds: publishedQuestionnaire.questions.map((question) => question.id),
    });

    expect(result.ok).toBe(true);
    expect(result.missingQuestionIds).toEqual([]);
  });

  it("creates stable browser-safe public tokens from random bytes", () => {
    const token = createBrowserSafePublicToken(() => Buffer.from("123456789012345678901234"));

    expect(token).toBe("MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0");
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("creates quiz sessions from the published report questionnaire", async () => {
    const repository = createMemoryRepository();

    const result = await createGuestQuizSession(repository, {
      createToken: () => "public-token",
    });

    expect(result.publicToken).toBe("public-token");
    await expect(repository.getSessionByToken("public-token")).resolves.toMatchObject({
      questionnaireVersionId: "version-1",
      status: "started",
    });
  });

  it("fails clearly when no published paid-report questionnaire exists", async () => {
    await expect(
      createGuestQuizSession(createMemoryRepository(null), {
        createToken: () => "public-token",
      }),
    ).rejects.toThrow("No published paid-report questionnaire is available");
  });

  it("upserts answers for a quiz session", async () => {
    const repository = createMemoryRepository();
    await createGuestQuizSession(repository, { createToken: () => "public-token" });

    await saveQuizAnswer(repository, "public-token", {
      questionId: "question-1",
      questionOptionId: "option-1-a",
    });
    await saveQuizAnswer(repository, "public-token", {
      questionId: "question-1",
      questionOptionId: "option-1-b",
    });

    await expect(repository.getSessionByToken("public-token")).resolves.toMatchObject({
      answers: { "question-1": "option-1-b" },
    });
  });

  it("rejects incomplete sessions before payment handoff", async () => {
    const repository = createMemoryRepository();
    await createGuestQuizSession(repository, { createToken: () => "public-token" });

    await expect(completeQuizSession(repository, "public-token")).rejects.toThrow("Missing 22 required answers");
  });

  it("marks a fully answered session completed before checkout creation", async () => {
    const repository = createMemoryRepository();
    await createGuestQuizSession(repository, { createToken: () => "public-token" });

    for (const question of publishedQuestionnaire.questions) {
      await saveQuizAnswer(repository, "public-token", {
        questionId: question.id,
        questionOptionId: question.options[0].id,
      });
    }

    const result = await completeQuizSession(repository, "public-token");

    expect(result.completed).toBe(true);
    await expect(repository.getSessionByToken("public-token")).resolves.toMatchObject({
      status: "completed",
    });
  });
});
