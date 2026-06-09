"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Lovi } from "@/components/brand/mascot";
import { Wordmark } from "@/components/brand/wordmark";
import { FunnelCard, FunnelShell, ProgressHeader } from "@/components/funnel";
import type { QuizQuestionnaire } from "@/domain/quiz/types";

type QuizPayload = {
  publicToken: string;
  status: string;
  questionnaire: QuizQuestionnaire;
  answers: Record<string, string>;
};

type QuizWizardProps = {
  mode?: "paid_report" | "matching";
};

export function QuizWizard({ mode = "paid_report" }: QuizWizardProps) {
  const bootstrapped = useRef(false);
  const [payload, setPayload] = useState<QuizPayload | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showProgressCheckpoint, setShowProgressCheckpoint] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config =
    mode === "matching"
      ? {
          pagePath: "/matching/questionnaire",
          sessionsPath: "/api/matching/sessions",
          currentSessionPath: "/api/matching/sessions/current",
          title: "שאלון עומק להתאמות",
          finalButton: "לראות את ההתאמות",
          submittingLabel: "מסיימים...",
          progressLabel: "התאמות",
        }
      : {
          pagePath: "/quiz",
          sessionsPath: "/api/quiz/sessions",
          currentSessionPath: null,
          title: "שאלון LovLov",
          finalButton: "לתשלום ופתיחת הדוח",
          submittingLabel: "מסיימים...",
          progressLabel: "דוח אישי",
        };
  const shellClassName = mode === "matching" ? "funnel-shell--wide quiz-shell quiz-shell--matching" : undefined;
  const panelClassName = mode === "matching" ? "quiz-panel quiz-panel--matching" : "quiz-panel";

  useEffect(() => {
    if (bootstrapped.current) {
      return;
    }

    bootstrapped.current = true;
    void loadOrCreateSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const questions = payload?.questionnaire.questions ?? [];
  const currentQuestion = questions[currentIndex];
  const answeredCount = payload ? countAnsweredQuestions(questions, payload.answers) : 0;
  const missingCount = Math.max(0, questions.length - answeredCount);
  const allAnswered = payload ? missingCount === 0 : false;
  const selectedOptionId = currentQuestion ? payload?.answers[currentQuestion.id] : undefined;
  const firstUnansweredIndex = payload ? findFirstUnansweredQuestionIndex(questions, payload.answers) : -1;
  const progressPercent = useMemo(() => {
    if (!questions.length) {
      return 0;
    }

    return Math.round(((currentIndex + 1) / questions.length) * 100);
  }, [currentIndex, questions.length]);
  useEffect(() => {
    if (
      mode !== "paid_report" ||
      loading ||
      showProgressCheckpoint ||
      !payload ||
      !currentQuestion ||
      savingQuestionId !== null
    ) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if (/^[1-5]$/.test(event.key)) {
        const option = currentQuestion.options[Number(event.key) - 1];
        if (option) {
          event.preventDefault();
          void selectAnswer(currentQuestion.id, option.id);
        }
        return;
      }

    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentIndex,
    currentQuestion,
    loading,
    mode,
    payload,
    questions.length,
    savingQuestionId,
    showProgressCheckpoint,
  ]);

  async function loadOrCreateSession() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("session");
      const response = token
        ? await fetch(`${config.sessionsPath}/${encodeURIComponent(token)}`)
        : config.currentSessionPath
          ? await fetch(config.currentSessionPath).then((currentResponse) =>
              currentResponse.status === 404 ? fetch(config.sessionsPath, { method: "POST" }) : currentResponse,
            )
          : await fetch(config.sessionsPath, { method: "POST" });
      const data = await readJsonResponse<QuizPayload>(response);

      setPayload(data);
      if (mode === "matching") {
        setCurrentIndex(getMatchingInitialQuestionIndex(data));
      }

      if (!token) {
        window.history.replaceState(null, "", `${config.pagePath}?session=${encodeURIComponent(data.publicToken)}`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "לא הצלחנו לפתוח את השאלון");
    } finally {
      setLoading(false);
    }
  }

  async function selectAnswer(questionId: string, questionOptionId: string) {
    if (!payload) {
      return;
    }

    const previousAnswers = payload.answers;
    const nextAnswers = { ...payload.answers, [questionId]: questionOptionId };
    const nextPayload = { ...payload, answers: nextAnswers };
    const shouldShowProgressCheckpoint = didCrossHalfwayCheckpoint(questions, previousAnswers, nextAnswers);
    const shouldSubmitPaidQuiz =
      mode === "paid_report" &&
      currentIndex === questions.length - 1 &&
      countAnsweredQuestions(questions, nextAnswers) === questions.length;

    setPayload(nextPayload);
    setSavingQuestionId(questionId);
    setError(null);

    try {
      await saveAnswerWithRetry(`${config.sessionsPath}/${encodeURIComponent(payload.publicToken)}/answers`, {
        questionId,
        questionOptionId,
      });

      if (shouldSubmitPaidQuiz) {
        await submitQuiz(nextPayload);
      } else if (shouldShowProgressCheckpoint) {
        setShowProgressCheckpoint(true);
      } else if (currentIndex < questions.length - 1) {
        setCurrentIndex((index) => (index === currentIndex ? index + 1 : index));
      }
    } catch (caught) {
      setPayload({ ...payload, answers: previousAnswers });
      setError(caught instanceof Error ? caught.message : "שמירת התשובה נכשלה");
    } finally {
      setSavingQuestionId(null);
    }
  }

  async function submitQuiz(payloadOverride = payload) {
    if (!payloadOverride || countAnsweredQuestions(questions, payloadOverride.answers) !== questions.length) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await readJsonResponse(
        await fetch(`${config.sessionsPath}/${encodeURIComponent(payloadOverride.publicToken)}/complete`, {
          method: "POST",
        }),
      );

      if (mode === "matching") {
        window.location.href = "/matches";
        return;
      }

      const checkout = await readJsonResponse<{ paymentId: string; redirectUrl: string }>(
        await fetch("/api/payments/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionToken: payloadOverride.publicToken }),
        }),
      );
      window.location.href = checkout.redirectUrl;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "לא הצלחנו לסיים את השאלון");
      setSubmitting(false);
    }
  }

  async function skipMatchingQuestionnaire() {
    if (mode !== "matching") {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await readJsonResponse(
        await fetch("/api/matching/questionnaire/skip", {
          method: "POST",
        }),
      );

      window.history.pushState(null, "", "/matches");
      window.location.href = "/matches";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "לא ניתן לדלג על שאלון ההתאמות");
      setSubmitting(false);
    }
  }

  function moveToFirstUnansweredQuestion() {
    if (firstUnansweredIndex === -1) {
      return;
    }

    setCurrentIndex(firstUnansweredIndex);
  }

  if (loading) {
    return (
      <FunnelShell className={shellClassName}>
        <FunnelCard className="quiz-panel--loading" aria-live="polite">
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line skeleton-line--short" />
        </FunnelCard>
      </FunnelShell>
    );
  }

  if (!payload || !currentQuestion) {
    return (
      <FunnelShell className={shellClassName}>
        <FunnelCard>
          <p className="funnel-eyebrow">LovLov</p>
          <h1>השאלון לא נטען</h1>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" type="button" onClick={() => void loadOrCreateSession()}>
            נסו שוב
          </button>
        </FunnelCard>
      </FunnelShell>
    );
  }

  if (showProgressCheckpoint) {
    const remainingCount = Math.max(0, questions.length - answeredCount);
    const checkpointPercent = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;

    return (
      <QuizProgressCheckpoint
        answeredCount={answeredCount}
        remainingCount={remainingCount}
        progressPercent={checkpointPercent}
        onContinue={() => {
          setShowProgressCheckpoint(false);
          setCurrentIndex((index) => Math.min(questions.length - 1, index + 1));
        }}
      />
    );
  }

  if (mode === "paid_report") {
    return (
      <main className="quiz-reference-page" dir="rtl">
        <div className="quiz-reference-inner">
          <header className="quiz-reference-topbar">
            <div className="quiz-reference-brand" aria-label="LovLov">
              <Wordmark size={24} />
            </div>
          </header>

          <section className="quiz-reference-progress" aria-label="התקדמות השאלון">
            <div className="quiz-reference-progress-meta">
              <span>{config.progressLabel}</span>
              <span>
                {currentIndex + 1} מתוך {questions.length}
              </span>
            </div>
            <div className="quiz-reference-progress-track" aria-hidden="true">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          </section>

          <section className="quiz-reference-main" aria-labelledby="quiz-title">
            <div className="quiz-reference-lovi" aria-hidden="true">
              <Lovi size={46} mood="smile" />
            </div>
            <p className="quiz-reference-number">שאלה {String(currentIndex + 1).padStart(2, "0")}</p>
            <h1 id="quiz-title" className="quiz-reference-question">
              {currentQuestion.prompt}
            </h1>
            <p className="quiz-reference-helper">ענה לפי מה שאתה באמת מרגיש, לא לפי מה שאתה חושב שצריך להרגיש.</p>

            <div className="quiz-reference-answers" role="radiogroup" aria-label={currentQuestion.prompt}>
              {currentQuestion.options.map((option, optionIndex) => {
                const selected = selectedOptionId === option.id;

                return (
                  <button
                    className={["quiz-reference-option", selected ? "quiz-reference-option--selected" : ""]
                      .filter(Boolean)
                      .join(" ")}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={savingQuestionId === currentQuestion.id}
                    key={option.id}
                    onClick={() => void selectAnswer(currentQuestion.id, option.id)}
                  >
                    <span className="quiz-reference-radio" aria-hidden="true">
                      {selected ? "✓" : optionIndex + 1}
                    </span>
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>

            {error ? <p className="form-error quiz-reference-error">{error}</p> : null}

            <div className="quiz-reference-actions">
              <button
                className="quiz-reference-back"
                type="button"
                disabled={currentIndex === 0 || savingQuestionId !== null}
                onClick={() => {
                  setShowProgressCheckpoint(false);
                  setCurrentIndex((index) => Math.max(0, index - 1));
                }}
              >
                → חזרה
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <FunnelShell showBrand={false} className={shellClassName}>
      <ProgressHeader current={currentIndex + 1} total={questions.length} label={config.progressLabel} />
      <FunnelCard className={panelClassName} aria-labelledby="quiz-title">
        <p className="funnel-eyebrow">{config.title}</p>
        <h1 id="quiz-title">
          שאלה {currentIndex + 1} מתוך {questions.length}
        </h1>
        <p className="quiz-question">{currentQuestion.prompt}</p>

        <div
          className={isVisualTasteQuestion(currentQuestion) ? "visual-answer-grid" : "answer-grid"}
          role="radiogroup"
          aria-label={currentQuestion.prompt}
        >
          {currentQuestion.options.map((option) => {
            const selected = selectedOptionId === option.id;
            const image = getOptionImage(option.score);
            const isSkip = isSkipOption(option);

            return (
              <button
                className={answerOptionClassName({ selected, visual: isVisualTasteQuestion(currentQuestion), skip: isSkip })}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={savingQuestionId === currentQuestion.id}
                key={option.id}
                onClick={() => void selectAnswer(currentQuestion.id, option.id)}
              >
                {image ? (
                  <Image
                    className="visual-answer-image"
                    src={image.src}
                    alt={image.alt}
                    width={640}
                    height={400}
                    unoptimized
                  />
                ) : null}
                <span className={image ? "visual-answer-label" : undefined}>{option.label}</span>
              </button>
            );
          })}
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="quiz-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={currentIndex === 0 || savingQuestionId !== null}
            onClick={() => {
              setShowProgressCheckpoint(false);
              setCurrentIndex((index) => Math.max(0, index - 1));
            }}
          >
            חזרה
          </button>

          {mode === "matching" ? (
            <button
              className="secondary-button"
              type="button"
              disabled={submitting || savingQuestionId !== null}
              onClick={() => void skipMatchingQuestionnaire()}
            >
              {submitting ? "מדלגים..." : "דלג/י לשלב ההתאמות"}
            </button>
          ) : null}

          {currentIndex === questions.length - 1 ? (
            mode === "matching" && !allAnswered ? (
              <button
                className="primary-button"
                type="button"
                disabled={savingQuestionId !== null || firstUnansweredIndex === -1}
                onClick={moveToFirstUnansweredQuestion}
              >
                לשאלה החסרה הראשונה
              </button>
            ) : (
              <button
                className="primary-button"
                type="button"
                disabled={!allAnswered || submitting || savingQuestionId !== null}
                onClick={() => void submitQuiz()}
              >
                {submitting ? config.submittingLabel : config.finalButton}
              </button>
            )
          ) : null}
        </div>

        <p className="quiz-footnote" data-progress-percent={progressPercent}>
          {mode === "matching"
            ? `${answeredCount} תשובות נשמרו, ${missingCount} שאלות נשארו`
            : `${answeredCount} תשובות נשמרו`}
        </p>
      </FunnelCard>
    </FunnelShell>
  );
}

function QuizProgressCheckpoint({
  answeredCount,
  remainingCount,
  progressPercent,
  onContinue,
}: {
  answeredCount: number;
  remainingCount: number;
  progressPercent: number;
  onContinue: () => void;
}) {
  const estimatedMinutes = Math.max(1, Math.ceil(remainingCount * 0.45));

  return (
    <main className="quiz-progress-checkpoint" dir="rtl">
      <section className="quiz-progress-checkpoint__panel" aria-labelledby="quiz-progress-checkpoint-title">
        <div className="quiz-progress-checkpoint__mascot" aria-hidden="true">
          <div className="quiz-progress-checkpoint__mascot-face">
            <span className="quiz-progress-checkpoint__eye quiz-progress-checkpoint__eye--right" />
            <span className="quiz-progress-checkpoint__eye quiz-progress-checkpoint__eye--left" />
            <span className="quiz-progress-checkpoint__smile" />
          </div>
        </div>
        <p className="quiz-progress-checkpoint__kicker">כבר באמצע · {progressPercent}%</p>
        <h1 id="quiz-progress-checkpoint-title">
          את/ה בונה
          <span>תמונה אמיתית.</span>
        </h1>
        <p className="quiz-progress-checkpoint__copy">
          נשארו עוד {remainingCount} שאלות, וכל תשובה מקרבת את LovLov להבנה מדויקת יותר של מה באמת מתאים לך.
        </p>

        <dl className="quiz-progress-checkpoint__stats" aria-label="מצב ההתקדמות">
          <div>
            <dt>{answeredCount}</dt>
            <dd>שאלות נענו</dd>
          </div>
          <div>
            <dt>~{estimatedMinutes}</dt>
            <dd>דקות נשארו</dd>
          </div>
          <div>
            <dt>3</dt>
            <dd>תכונות מתגלות</dd>
          </div>
        </dl>

        <button className="quiz-progress-checkpoint__button" type="button" onClick={onContinue}>
          להמשיך
        </button>
      </section>
    </main>
  );
}

async function readJsonResponse<T = unknown>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new HttpResponseError(data?.error ?? "בקשה נכשלה", response.status);
  }

  return data as T;
}

async function saveAnswerWithRetry(
  url: string,
  answer: { questionId: string; questionOptionId: string },
): Promise<void> {
  try {
    await saveAnswer(url, answer);
  } catch (caught) {
    if (!isTransientSaveError(caught)) {
      throw caught;
    }

    await saveAnswer(url, answer);
  }
}

async function saveAnswer(url: string, answer: { questionId: string; questionOptionId: string }): Promise<void> {
  await readJsonResponse(
    await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(answer),
    }),
  );
}

function isTransientSaveError(caught: unknown) {
  if (!(caught instanceof HttpResponseError)) {
    return true;
  }

  return caught.status === 408 || caught.status === 429 || caught.status >= 500;
}

class HttpResponseError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "HttpResponseError";
  }
}

function isVisualTasteQuestion(question: QuizPayload["questionnaire"]["questions"][number]) {
  return Boolean(question.usageFlags?.visualTaste || question.stableKey?.startsWith("visual_taste_"));
}

function getMatchingInitialQuestionIndex(payload: QuizPayload) {
  const questions = payload.questionnaire.questions;
  const firstUnansweredIndex = findFirstUnansweredQuestionIndex(questions, payload.answers);

  return firstUnansweredIndex === -1 ? Math.max(0, questions.length - 1) : firstUnansweredIndex;
}

function findFirstUnansweredQuestionIndex(
  questions: QuizPayload["questionnaire"]["questions"],
  answers: QuizPayload["answers"],
) {
  return questions.findIndex((question) => !answers[question.id]);
}

function countAnsweredQuestions(questions: QuizPayload["questionnaire"]["questions"], answers: QuizPayload["answers"]) {
  return questions.reduce((count, question) => (answers[question.id] ? count + 1 : count), 0);
}

function didCrossHalfwayCheckpoint(
  questions: QuizPayload["questionnaire"]["questions"],
  previousAnswers: QuizPayload["answers"],
  nextAnswers: QuizPayload["answers"],
) {
  if (questions.length < 2) {
    return false;
  }

  const halfwayCount = Math.ceil(questions.length / 2);
  const previousAnsweredCount = countAnsweredQuestions(questions, previousAnswers);
  const nextAnsweredCount = countAnsweredQuestions(questions, nextAnswers);

  return previousAnsweredCount < halfwayCount && nextAnsweredCount >= halfwayCount;
}

function isSkipOption(option: QuizPayload["questionnaire"]["questions"][number]["options"][number]) {
  const visualTaste = getVisualTasteScore(option.score);
  return option.value === "skip" || visualTaste?.skip === true;
}

function getOptionImage(score: Record<string, unknown> | undefined) {
  const image = score?.image;
  if (!image || typeof image !== "object" || Array.isArray(image)) {
    return null;
  }

  const candidate = image as Record<string, unknown>;
  return typeof candidate.src === "string" && typeof candidate.alt === "string"
    ? { src: candidate.src, alt: candidate.alt }
    : null;
}

function getVisualTasteScore(score: Record<string, unknown> | undefined) {
  const visualTaste = score?.visual_taste ?? score?.visualTaste;
  return visualTaste && typeof visualTaste === "object" && !Array.isArray(visualTaste)
    ? (visualTaste as Record<string, unknown>)
    : null;
}

function answerOptionClassName(input: { selected: boolean; visual: boolean; skip: boolean }) {
  const classes = [input.visual ? "visual-answer-option" : "answer-option"];
  if (input.selected) {
    classes.push(input.visual ? "visual-answer-option--selected" : "answer-option--selected");
  }
  if (input.skip) {
    classes.push("visual-answer-option--skip");
  }
  return classes.join(" ");
}
