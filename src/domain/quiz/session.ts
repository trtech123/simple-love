import { randomBytes } from "node:crypto";
import type { QuizQuestionnaire, QuizSessionRecord, QuizSessionSnapshot } from "./types";

export type { QuizQuestionnaire, QuizSessionRecord, QuizSessionSnapshot } from "./types";

export type QuizRepository = {
  getPublishedReportQuestionnaire(): Promise<QuizQuestionnaire | null>;
  createSession(input: {
    publicToken: string;
    questionnaireVersionId: string;
  }): Promise<QuizSessionRecord>;
  getSessionByToken(publicToken: string): Promise<QuizSessionRecord | null>;
  upsertAnswer(input: {
    sessionId: string;
    questionId: string;
    questionOptionId: string;
  }): Promise<void>;
  markSessionCompleted(sessionId: string): Promise<void>;
};

export type CompleteValidationResult = {
  ok: boolean;
  missingQuestionIds: string[];
};

export function createBrowserSafePublicToken(
  getBytes: () => Buffer = () => randomBytes(24),
) {
  return getBytes().toString("base64url");
}

export function validateCompleteQuizAnswers(input: {
  requiredQuestionIds: string[];
  answeredQuestionIds: string[];
}): CompleteValidationResult {
  const answered = new Set(input.answeredQuestionIds);
  const missingQuestionIds = input.requiredQuestionIds.filter((questionId) => !answered.has(questionId));

  return {
    ok: missingQuestionIds.length === 0,
    missingQuestionIds,
  };
}

export async function createGuestQuizSession(
  repository: QuizRepository,
  options: { createToken?: () => string } = {},
) {
  const questionnaire = await repository.getPublishedReportQuestionnaire();

  if (!questionnaire) {
    throw new Error("No published paid-report questionnaire is available");
  }

  const session = await repository.createSession({
    publicToken: options.createToken?.() ?? createBrowserSafePublicToken(),
    questionnaireVersionId: questionnaire.id,
  });

  return {
    publicToken: session.publicToken,
    questionnaire,
    answers: session.answers,
    status: session.status,
  };
}

export async function getQuizSessionSnapshot(
  repository: QuizRepository,
  publicToken: string,
): Promise<QuizSessionSnapshot> {
  const session = await requireSession(repository, publicToken);
  const questionnaire = await requirePublishedQuestionnaire(repository);

  if (questionnaire.id !== session.questionnaireVersionId) {
    throw new Error("Quiz session uses a questionnaire version that is no longer available");
  }

  return { session, questionnaire };
}

export async function saveQuizAnswer(
  repository: QuizRepository,
  publicToken: string,
  input: { questionId: string; questionOptionId: string },
) {
  const { session, questionnaire } = await getQuizSessionSnapshot(repository, publicToken);
  const question = questionnaire.questions.find((candidate) => candidate.id === input.questionId);

  if (!question) {
    throw new Error("Question does not belong to this quiz session");
  }

  if (!question.options.some((option) => option.id === input.questionOptionId)) {
    throw new Error("Answer option does not belong to this question");
  }

  await repository.upsertAnswer({
    sessionId: session.id,
    questionId: input.questionId,
    questionOptionId: input.questionOptionId,
  });
}

export async function completeQuizSession(repository: QuizRepository, publicToken: string) {
  const { session, questionnaire } = await getQuizSessionSnapshot(repository, publicToken);
  const requiredQuestionIds = questionnaire.questions
    .filter((question) => question.questionType === "multiple_choice")
    .map((question) => question.id);
  const validation = validateCompleteQuizAnswers({
    requiredQuestionIds,
    answeredQuestionIds: Object.keys(session.answers),
  });

  if (!validation.ok) {
    throw new Error(`Missing ${validation.missingQuestionIds.length} required answers`);
  }

  await repository.markSessionCompleted(session.id);

  return {
    completed: true,
  };
}

async function requireSession(repository: QuizRepository, publicToken: string) {
  const session = await repository.getSessionByToken(publicToken);

  if (!session) {
    throw new Error("Quiz session was not found");
  }

  return session;
}

async function requirePublishedQuestionnaire(repository: QuizRepository) {
  const questionnaire = await repository.getPublishedReportQuestionnaire();

  if (!questionnaire) {
    throw new Error("No published paid-report questionnaire is available");
  }

  return questionnaire;
}
