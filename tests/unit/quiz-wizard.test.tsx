import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuizWizard } from "../../src/app/quiz/quiz-wizard";

vi.mock("@/components/brand/mascot", () => ({
  Lovi: () => <div data-testid="lovi" />,
  Mascot: () => <div data-testid="mascot" />,
}));

vi.mock("@/components/brand/wordmark", () => ({
  Wordmark: () => <div data-testid="wordmark" />,
}));

const fetchMock = vi.fn();

describe("QuizWizard visual taste cards", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", "/matching/questionnaire");
    fetchMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders visual taste A/B image choices and submits the skip option accessibly", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/matching/sessions/current") {
        return jsonResponse({ error: "No matching session exists" }, 404);
      }

      if (url === "/api/matching/sessions" && init?.method === "POST") {
        return jsonResponse({
          publicToken: "matching-token",
          status: "started",
          answers: {},
          questionnaire: {
            id: "matching-version-1",
            questions: [
              {
                id: "visual-question-1",
                stableKey: "visual_taste_01",
                prompt: "Pick the date-night setting that feels better",
                questionType: "multiple_choice",
                usageFlags: { matchingInput: true, visualTaste: true },
                options: [
                  {
                    id: "option-a",
                    label: "Quiet room",
                    value: "a",
                    position: 1,
                    score: {
                      visual_taste: { quiet_social: -1 },
                      image: { src: "/visual-taste/quiet-reading-room.svg", alt: "Quiet reading room" },
                    },
                  },
                  {
                    id: "option-b",
                    label: "Lively table",
                    value: "b",
                    position: 2,
                    score: {
                      visual_taste: { quiet_social: 1 },
                      image: { src: "/visual-taste/lively-dinner-table.svg", alt: "Lively dinner table" },
                    },
                  },
                  {
                    id: "option-skip",
                    label: "No preference",
                    value: "skip",
                    position: 3,
                    score: { visual_taste: { skip: true } },
                  },
                ],
              },
            ],
          },
        });
      }

      if (url === "/api/matching/sessions/matching-token/answers" && init?.method === "PUT") {
        return jsonResponse({ saved: true });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    const { container } = render(<QuizWizard mode="matching" />);

    const firstChoice = await screen.findByRole("radio", { name: /Quiet room/i });
    const secondChoice = screen.getByRole("radio", { name: /Lively table/i });
    const skip = screen.getByRole("radio", { name: /No preference/i });

    expect(screen.getByRole("img", { name: "Quiet reading room" }).getAttribute("src")).toBe(
      "/visual-taste/quiet-reading-room.svg",
    );
    expect(screen.getByRole("img", { name: "Lively dinner table" }).getAttribute("src")).toBe(
      "/visual-taste/lively-dinner-table.svg",
    );
    expect(firstChoice.getAttribute("aria-checked")).toBe("false");
    expect(secondChoice.getAttribute("aria-checked")).toBe("false");
    expect(container.querySelector(".quiz-shell--matching")).toBeTruthy();

    fireEvent.click(skip);

    await waitFor(() => expect(skip.getAttribute("aria-checked")).toBe("true"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/matching/sessions/matching-token/answers",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ questionId: "visual-question-1", questionOptionId: "option-skip" }),
      }),
    );
  });

  it("renders the paid quiz reference layout without applying it to matching", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/quiz/sessions" && init?.method === "POST") {
        return jsonResponse({
          publicToken: "paid-token",
          status: "started",
          answers: {},
          questionnaire: matchingQuestionnaire(5),
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    window.history.replaceState(null, "", "/quiz");
    const { container } = render(<QuizWizard />);

    expect(await screen.findByLabelText("LovLov")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "שמירה ויציאה" })).toBeNull();
    expect(screen.getByText("דוח אישי")).toBeTruthy();
    expect(screen.getByText("1 מתוך 5")).toBeTruthy();
    expect(screen.getByText("ענה לפי מה שאתה באמת מרגיש, לא לפי מה שאתה חושב שצריך להרגיש.")).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Question 1" })).toBeTruthy();
    expect(screen.queryByText(/לחץ/)).toBeNull();
    expect(screen.queryByText(/אנטר/)).toBeNull();
    expect(screen.queryByRole("button", { name: "המשך ←" })).toBeNull();
    expect(screen.queryByRole("button", { name: "לתשלום ופתיחת הדוח" })).toBeNull();
    expect(container.querySelector(".quiz-reference-page")).toBeTruthy();
    expect(container.querySelector(".quiz-reference-answers")).toBeTruthy();
    expect(
      Array.from(container.querySelectorAll(".quiz-reference-radio")).map((radio) => radio.textContent),
    ).toEqual(["1"]);
    expect(container.querySelectorAll(".quiz-reference-actions button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "→ חזרה" }).hasAttribute("disabled")).toBe(true);
  });

  it("selects paid quiz answers with number keys through the save path", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/quiz/sessions" && init?.method === "POST") {
        return jsonResponse({
          publicToken: "paid-token",
          status: "started",
          answers: {},
          questionnaire: matchingQuestionnaire(5),
        });
      }

      if (url === "/api/quiz/sessions/paid-token/answers" && init?.method === "PUT") {
        return jsonResponse({ saved: true });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    window.history.replaceState(null, "", "/quiz");
    render(<QuizWizard />);

    await screen.findByText("Question 1");
    fireEvent.keyDown(window, { key: "1" });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/quiz/sessions/paid-token/answers",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ questionId: "question-1", questionOptionId: "option-1" }),
        }),
      ),
    );
    expect(await screen.findByText("Question 2")).toBeTruthy();
  });

  it("saves the final paid answer and starts checkout without a separate continue action", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/quiz/sessions" && init?.method === "POST") {
        return jsonResponse({
          publicToken: "paid-token",
          status: "started",
          answers: {},
          questionnaire: matchingQuestionnaire(5),
        });
      }

      if (url === "/api/quiz/sessions/paid-token/answers" && init?.method === "PUT") {
        return jsonResponse({ saved: true });
      }

      if (url === "/api/quiz/sessions/paid-token/complete" && init?.method === "POST") {
        return jsonResponse({ completed: true });
      }

      if (url === "/api/payments/checkout" && init?.method === "POST") {
        return jsonResponse({ paymentId: "payment-1", redirectUrl: "#payment-1" });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    window.history.replaceState(null, "", "/quiz");
    render(<QuizWizard />);

    for (let index = 1; index <= 5; index += 1) {
      fireEvent.click(await screen.findByRole("radio", { name: `Answer ${index}` }));

      if (index === 3) {
        fireEvent.click(await screen.findByRole("button", { name: "להמשיך" }));
      }
    }


    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/quiz/sessions/paid-token/complete",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/payments/checkout",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sessionToken: "paid-token" }),
      }),
    );
  });

  it("keeps the reference quiz layout out of matching mode", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/matching/sessions/current") {
        return jsonResponse({
          publicToken: "matching-token",
          status: "started",
          answers: {},
          questionnaire: matchingQuestionnaire(2),
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    const { container } = render(<QuizWizard mode="matching" />);

    expect(await screen.findByText("Question 1")).toBeTruthy();
    expect(container.querySelector(".quiz-reference-page")).toBeNull();
    expect(screen.queryByRole("button", { name: "שמירה ויציאה" })).toBeNull();
  });

  it("shows a paid-report progress checkpoint after the halfway answer", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/quiz/sessions" && init?.method === "POST") {
        return jsonResponse({
          publicToken: "paid-token",
          status: "started",
          answers: {},
          questionnaire: {
            id: "paid-version-1",
            questions: Array.from({ length: 22 }, (_, index) => ({
              id: `question-${index + 1}`,
              stableKey: `question_${index + 1}`,
              prompt: `Question ${index + 1}`,
              questionType: "multiple_choice",
              options: [
                {
                  id: `option-${index + 1}`,
                  label: `Answer ${index + 1}`,
                  value: "answer",
                  position: 1,
                  score: {},
                },
              ],
            })),
          },
        });
      }

      if (url === "/api/quiz/sessions/paid-token/answers" && init?.method === "PUT") {
        return jsonResponse({ saved: true });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    window.history.replaceState(null, "", "/quiz");
    render(<QuizWizard />);

    for (let index = 1; index <= 11; index += 1) {
      const answer = await screen.findByRole("radio", { name: `Answer ${index}` });
      fireEvent.click(answer);
    }

    expect(await screen.findByRole("heading", { name: /תמונה אמיתית/ })).toBeTruthy();
    expect(screen.getByText("כבר באמצע · 50%")).toBeTruthy();
    expect(screen.getByText("11")).toBeTruthy();
    expect(screen.getByText("שאלות נענו")).toBeTruthy();
    expect(screen.getByText("~5")).toBeTruthy();
    expect(screen.getByText("דקות נשארו")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("תכונות מתגלות")).toBeTruthy();
    expect(screen.getByText(/נשארו עוד 11 שאלות/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "להמשיך" }));

    expect(await screen.findByRole("heading", { name: "Question 12" })).toBeTruthy();
    expect(screen.getByText("12 מתוך 22")).toBeTruthy();
  });

  it("shows a matching progress checkpoint after the halfway answer and continues to the next question", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/matching/sessions/current") {
        return jsonResponse({
          publicToken: "matching-token",
          status: "started",
          answers: {},
          questionnaire: matchingQuestionnaire(6),
        });
      }

      if (url === "/api/matching/sessions/matching-token/answers" && init?.method === "PUT") {
        return jsonResponse({ saved: true });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    render(<QuizWizard mode="matching" />);

    for (let index = 1; index <= 3; index += 1) {
      const answer = await screen.findByRole("radio", { name: `Answer ${index}` });
      fireEvent.click(answer);
    }

    expect(await screen.findByRole("heading", { name: /תמונה אמיתית/ })).toBeTruthy();
    expect(screen.getByText("כבר באמצע · 50%")).toBeTruthy();
    expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("שאלות נענו")).toBeTruthy();
    expect(screen.getByText("~2")).toBeTruthy();
    expect(screen.getByText("דקות נשארו")).toBeTruthy();
    expect(screen.getByText(/נשארו עוד 3 שאלות/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "להמשיך" }));

    expect(await screen.findByText("Question 4")).toBeTruthy();
    expect(screen.getByText("4 מתוך 6")).toBeTruthy();
    expect(screen.getByRole("button", { name: "דלג/י לשלב ההתאמות" })).toBeTruthy();
  });

  it("does not show the matching checkpoint when an existing session starts past halfway", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/matching/sessions/current") {
        return jsonResponse({
          publicToken: "matching-token",
          status: "started",
          answers: {
            "question-1": "option-1",
            "question-2": "option-2",
            "question-3": "option-3",
            "question-4": "option-4",
          },
          questionnaire: matchingQuestionnaire(6),
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    render(<QuizWizard mode="matching" />);

    expect(await screen.findByText("Question 5")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /תמונה אמיתית/ })).toBeNull();
    expect(screen.getByText("5 מתוך 6")).toBeTruthy();
  });

  it("shows a whole-questionnaire matching skip CTA without per-question skip navigation", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/matching/sessions/current") {
        return jsonResponse({
          publicToken: "matching-token",
          status: "started",
          answers: {},
          questionnaire: matchingQuestionnaire(3),
        });
      }

      if (url === "/api/matching/sessions/matching-token/answers" && init?.method === "PUT") {
        return jsonResponse({ saved: true });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    render(<QuizWizard mode="matching" />);

    expect(await screen.findByText("Question 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "דלג/י לשלב ההתאמות" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "דלג/י בינתיים" })).toBeNull();
    expect(screen.queryByRole("button", { name: "המשך" })).toBeNull();
  });

  it("skips the whole matching questionnaire and redirects to matches", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/matching/sessions/current") {
        return jsonResponse({
          publicToken: "matching-token",
          status: "started",
          answers: {},
          questionnaire: matchingQuestionnaire(2),
        });
      }

      if (url === "/api/matching/questionnaire/skip" && init?.method === "POST") {
        return jsonResponse({ completed: true, matchCount: 0 });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    render(<QuizWizard mode="matching" />);

    fireEvent.click(await screen.findByRole("button", { name: "דלג/י לשלב ההתאמות" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/matching/questionnaire/skip",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(window.location.pathname).toBe("/matches"));
  });

  it("opens an existing matching session on the first unanswered question", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/matching/sessions/current") {
        return jsonResponse({
          publicToken: "matching-token",
          status: "started",
          answers: { "question-1": "option-1" },
          questionnaire: matchingQuestionnaire(3),
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    render(<QuizWizard mode="matching" />);

    expect(await screen.findByText("Question 2")).toBeTruthy();
  });

  it("does not offer matching completion while required answers are missing", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/matching/sessions/current") {
        return jsonResponse({
          publicToken: "matching-token",
          status: "started",
          answers: { "question-1": "option-1", "question-2": "option-2" },
          questionnaire: matchingQuestionnaire(3),
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    render(<QuizWizard mode="matching" />);

    expect(await screen.findByText("Question 3")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "לראות את ההתאמות" })).toBeNull();

    expect(screen.getByRole("button", { name: "דלג/י לשלב ההתאמות" })).toBeTruthy();
  });

  it("does not add skip navigation to paid-report quizzes", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/quiz/sessions" && init?.method === "POST") {
        return jsonResponse({
          publicToken: "paid-token",
          status: "started",
          answers: {},
          questionnaire: matchingQuestionnaire(2),
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    window.history.replaceState(null, "", "/quiz");
    render(<QuizWizard />);

    expect(await screen.findByText("Question 1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "דלג/י בינתיים" })).toBeNull();
    expect(screen.queryByRole("button", { name: "המשך" })).toBeNull();
    expect(screen.queryByRole("button", { name: "דלג/י לשלב ההתאמות" })).toBeNull();
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function matchingQuestionnaire(count: number) {
  return {
    id: "matching-version-1",
    questions: Array.from({ length: count }, (_, index) => ({
      id: `question-${index + 1}`,
      stableKey: `question_${index + 1}`,
      prompt: `Question ${index + 1}`,
      questionType: "multiple_choice",
      usageFlags: { matchingInput: true },
      options: [
        {
          id: `option-${index + 1}`,
          label: `Answer ${index + 1}`,
          value: "answer",
          position: 1,
          score: {},
        },
      ],
    })),
  };
}
