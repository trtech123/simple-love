"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { FunnelCard, FunnelShell, FunnelStateIcon, ProgressHeader } from "@/components/funnel";
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
  const [showMilestone, setShowMilestone] = useState(false);
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
  const answeredCount = payload ? Object.keys(payload.answers).length : 0;
  const allAnswered = payload ? answeredCount === questions.length : false;
  const selectedOptionId = currentQuestion ? payload?.answers[currentQuestion.id] : undefined;
  const progressPercent = useMemo(() => {
    if (!questions.length) {
      return 0;
    }

    return Math.round(((currentIndex + 1) / questions.length) * 100);
  }, [currentIndex, questions.length]);

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
    setPayload({ ...payload, answers: { ...payload.answers, [questionId]: questionOptionId } });
    setSavingQuestionId(questionId);
    setError(null);

    try {
      await saveAnswerWithRetry(`${config.sessionsPath}/${encodeURIComponent(payload.publicToken)}/answers`, {
        questionId,
        questionOptionId,
      });

      if (mode === "paid_report" && currentIndex === 6 && questions.length > 7) {
        setShowMilestone(true);
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

  async function submitQuiz() {
    if (!payload || !allAnswered) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await readJsonResponse(
        await fetch(`${config.sessionsPath}/${encodeURIComponent(payload.publicToken)}/complete`, {
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
          body: JSON.stringify({ sessionToken: payload.publicToken }),
        }),
      );
      window.location.href = checkout.redirectUrl;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "לא הצלחנו לסיים את השאלון");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <FunnelShell>
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
      <FunnelShell>
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

  if (showMilestone) {
    return (
      <FunnelShell showBrand={false}>
        <ProgressHeader current={Math.min(currentIndex + 1, questions.length)} total={questions.length} label={config.progressLabel} />
        <FunnelCard className="quiz-milestone" aria-labelledby="quiz-milestone-title">
          <FunnelStateIcon icon={CheckCircle2} />
          <p className="funnel-eyebrow">כבר יש בסיס לדוח</p>
          <h1 id="quiz-milestone-title">ענית על החלק הראשון</h1>
          <p>עכשיו נשאר לדייק את הדפוסים שחוזרים בקשרים, כדי שהדוח ירגיש אישי ולא כללי.</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setShowMilestone(false);
              setCurrentIndex((index) => Math.max(index, 7));
            }}
          >
            להמשיך לשאלות הבאות
          </button>
        </FunnelCard>
      </FunnelShell>
    );
  }

  return (
    <FunnelShell showBrand={false}>
      <ProgressHeader current={currentIndex + 1} total={questions.length} label={config.progressLabel} />
      <FunnelCard className="quiz-panel" aria-labelledby="quiz-title">
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
              setShowMilestone(false);
              setCurrentIndex((index) => Math.max(0, index - 1));
            }}
          >
            חזרה
          </button>

          {currentIndex === questions.length - 1 ? (
            <button
              className="primary-button"
              type="button"
              disabled={!allAnswered || submitting || savingQuestionId !== null}
              onClick={() => void submitQuiz()}
            >
              {submitting ? config.submittingLabel : config.finalButton}
            </button>
          ) : null}
        </div>

        <p className="quiz-footnote" data-progress-percent={progressPercent}>
          {answeredCount} תשובות נשמרו
        </p>
      </FunnelCard>
    </FunnelShell>
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
