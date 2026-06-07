import { describe, expect, it } from "vitest";
import {
  buildQuestionnaireReplacementPayload,
  canPublishQuestionnaire,
  validateQuestionnaireDraft,
} from "../../src/domain/admin/questionnaire-admin";

describe("questionnaire admin rules", () => {
  it("accepts a valid questionnaire draft", () => {
    const result = validateQuestionnaireDraft({
      title: "שאלון",
      purpose: "paid_report",
      blocks: [
        {
          title: "בלוק",
          questions: [
            {
              stableKey: "q1",
              prompt: "מה קורה?",
              questionType: "multiple_choice",
              options: [
                { label: "א", value: "a" },
                { label: "ב", value: "b" },
              ],
              usageFlags: { aiReportInput: true },
            },
          ],
        },
      ],
    });

    expect(result.title).toBe("שאלון");
  });

  it("rejects multiple choice questions with fewer than two options", () => {
    expect(() =>
      validateQuestionnaireDraft({
        title: "שאלון",
        purpose: "paid_report",
        blocks: [
          {
            title: "בלוק",
            questions: [
              {
                stableKey: "q1",
                prompt: "מה קורה?",
                questionType: "multiple_choice",
                options: [{ label: "א", value: "a" }],
                usageFlags: { aiReportInput: true },
              },
            ],
          },
        ],
      }),
    ).toThrow("Multiple choice questions require at least two options");
  });

  it("publishes only drafts with at least one block and one question", () => {
    expect(canPublishQuestionnaire({ blockCount: 1, questionCount: 1, status: "draft" })).toBe(true);
    expect(canPublishQuestionnaire({ blockCount: 0, questionCount: 0, status: "draft" })).toBe(false);
    expect(canPublishQuestionnaire({ blockCount: 1, questionCount: 1, status: "published" })).toBe(false);
  });

  it("builds ordered replacement payloads for draft questionnaire saves", () => {
    const payload = buildQuestionnaireReplacementPayload({
      title: "Depth",
      purpose: "matching",
      blocks: [
        {
          title: "Second",
          questions: [
            {
              stableKey: "q2",
              prompt: "Question 2",
              questionType: "open_text",
              options: [],
              usageFlags: { matchingInput: true },
            },
          ],
        },
        {
          title: "First",
          questions: [
            {
              stableKey: "q1",
              prompt: "Question 1",
              questionType: "multiple_choice",
              options: [
                { label: "B", value: "b" },
                { label: "A", value: "a" },
              ],
              usageFlags: { aiReportInput: true },
            },
          ],
        },
      ],
    });

    expect(payload.blocks[0].position).toBe(1);
    expect(payload.blocks[1].position).toBe(2);
    expect(payload.blocks[1].questions[0].position).toBe(1);
    expect(payload.blocks[1].questions[0].options[0].position).toBe(1);
    expect(payload.blocks[1].questions[0].options[1].position).toBe(2);
  });
});
