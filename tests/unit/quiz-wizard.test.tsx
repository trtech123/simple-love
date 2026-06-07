import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuizWizard } from "../../src/app/quiz/quiz-wizard";

vi.mock("@/components/brand/mascot", () => ({
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

    render(<QuizWizard mode="matching" />);

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

  it("shows a local paid-report milestone after the seventh answer", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/quiz/sessions" && init?.method === "POST") {
        return jsonResponse({
          publicToken: "paid-token",
          status: "started",
          answers: {},
          questionnaire: {
            id: "paid-version-1",
            questions: Array.from({ length: 8 }, (_, index) => ({
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

    for (let index = 1; index <= 7; index += 1) {
      const answer = await screen.findByRole("radio", { name: `Answer ${index}` });
      fireEvent.click(answer);
    }

    expect(await screen.findByRole("heading", { name: "ענית על החלק הראשון" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "להמשיך לשאלות הבאות" }));

    expect(await screen.findByRole("heading", { name: "שאלה 8 מתוך 8" })).toBeTruthy();
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
