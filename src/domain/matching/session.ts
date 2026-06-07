import {
  createBrowserSafePublicToken,
  validateCompleteQuizAnswers,
  type QuizQuestionnaire,
  type QuizSessionRecord,
} from "@/domain/quiz/session";

export type MatchingSessionRepository = {
  getPublishedMatchingQuestionnaire(): Promise<QuizQuestionnaire | null>;
  isMatchingProfileComplete(userId: string): Promise<boolean>;
  getLatestSessionForUser(userId: string): Promise<QuizSessionRecord | null>;
  createSession(input: {
    publicToken: string;
    questionnaireVersionId: string;
    userId: string;
  }): Promise<QuizSessionRecord>;
  getSessionByToken(publicToken: string): Promise<QuizSessionRecord | null>;
  upsertAnswer(input: {
    sessionId: string;
    questionId: string;
    questionOptionId: string;
  }): Promise<void>;
  markSessionCompleted(sessionId: string): Promise<void>;
  upsertTraitsAndGenerateMatches(userId: string, session: QuizSessionRecord, questionnaire: QuizQuestionnaire): Promise<number>;
};

export async function createOrGetMatchingSession(
  repository: MatchingSessionRepository,
  userId: string,
  options: { createToken?: () => string } = {},
) {
  if (!(await repository.isMatchingProfileComplete(userId))) {
    throw new Error("Complete your matching profile before starting the questionnaire");
  }

  const questionnaire = await requirePublishedMatchingQuestionnaire(repository);
  const existing = await repository.getLatestSessionForUser(userId);
  const session =
    existing ??
    (await repository.createSession({
      publicToken: options.createToken?.() ?? createBrowserSafePublicToken(),
      questionnaireVersionId: questionnaire.id,
      userId,
    }));

  ensureQuestionnaireVersion(session, questionnaire);

  return {
    publicToken: session.publicToken,
    status: session.status,
    questionnaire,
    answers: session.answers,
  };
}

export async function getCurrentMatchingSession(repository: MatchingSessionRepository, userId: string) {
  if (!(await repository.isMatchingProfileComplete(userId))) {
    throw new Error("Complete your matching profile before starting the questionnaire");
  }

  const questionnaire = await requirePublishedMatchingQuestionnaire(repository);
  const session = await repository.getLatestSessionForUser(userId);

  if (!session) {
    return null;
  }

  ensureQuestionnaireVersion(session, questionnaire);

  return {
    publicToken: session.publicToken,
    status: session.status,
    questionnaire,
    answers: session.answers,
  };
}

export async function saveMatchingAnswer(
  repository: MatchingSessionRepository,
  userId: string,
  publicToken: string,
  input: { questionId: string; questionOptionId: string },
) {
  const { session, questionnaire } = await requireOwnedSession(repository, userId, publicToken);
  const question = questionnaire.questions.find((candidate) => candidate.id === input.questionId);

  if (!question) {
    throw new Error("Question does not belong to this matching session");
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

export async function completeMatchingSession(
  repository: MatchingSessionRepository,
  userId: string,
  publicToken: string,
) {
  const { session, questionnaire } = await requireOwnedSession(repository, userId, publicToken);
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
  const matchCount = await repository.upsertTraitsAndGenerateMatches(userId, session, questionnaire);

  return {
    completed: true,
    matchCount,
  };
}

async function requireOwnedSession(
  repository: MatchingSessionRepository,
  userId: string,
  publicToken: string,
) {
  const questionnaire = await requirePublishedMatchingQuestionnaire(repository);
  const session = await repository.getSessionByToken(publicToken);

  if (!session) {
    throw new Error("Matching session was not found");
  }

  if (session.userId !== userId) {
    throw new Error("Matching session does not belong to the current user");
  }

  ensureQuestionnaireVersion(session, questionnaire);

  return { session, questionnaire };
}

function ensureQuestionnaireVersion(session: QuizSessionRecord, questionnaire: QuizQuestionnaire) {
  if (session.questionnaireVersionId !== questionnaire.id) {
    throw new Error("Matching session uses a questionnaire version that is no longer available");
  }
}

async function requirePublishedMatchingQuestionnaire(repository: MatchingSessionRepository) {
  const questionnaire = await repository.getPublishedMatchingQuestionnaire();

  if (!questionnaire) {
    throw new Error("No published matching questionnaire is available");
  }

  return questionnaire;
}
