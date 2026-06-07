export type QuizQuestionType = "multiple_choice" | "scale" | "open_text";

export type QuizOption = {
  id: string;
  label?: string;
  value?: string;
  position?: number;
  score?: Record<string, unknown>;
};

export type QuizQuestion = {
  id: string;
  stableKey?: string;
  prompt?: string;
  questionType: QuizQuestionType;
  position?: number;
  usageFlags?: Record<string, boolean>;
  traitMapping?: Record<string, unknown>;
  options: QuizOption[];
};

export type QuizQuestionnaire = {
  id: string;
  title?: string;
  questions: QuizQuestion[];
};

export type QuizSessionStatus =
  | "started"
  | "completed"
  | "payment_pending"
  | "paid"
  | "report_generating"
  | "report_ready"
  | "report_failed";

export type QuizSessionRecord = {
  id: string;
  publicToken: string;
  userId?: string | null;
  questionnaireVersionId: string;
  status: QuizSessionStatus;
  answers: Record<string, string>;
};

export type QuizSessionSnapshot = {
  session: QuizSessionRecord;
  questionnaire: QuizQuestionnaire;
};
