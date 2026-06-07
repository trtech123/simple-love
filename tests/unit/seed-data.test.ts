import { describe, expect, it } from "vitest";
import { archetypeSeeds } from "../../src/data/seeds/archetypes";
import { reportQuestionnaireSeed } from "../../src/data/seeds/report-questionnaire";
import { reportPromptSeed } from "../../src/data/seeds/report-prompt";
import { matchingQuestionnaireSeed } from "../../src/data/seeds/matching-questionnaire";

describe("seed data", () => {
  it("contains the 12 base archetypes", () => {
    expect(archetypeSeeds).toHaveLength(12);
    expect(archetypeSeeds[0]).toMatchObject({
      stableKey: "warm_closer",
      name: "החם הנסגר",
    });
  });

  it("contains a 22-question paid report questionnaire", () => {
    const questionCount = reportQuestionnaireSeed.blocks.flatMap((block) => block.questions).length;
    expect(reportQuestionnaireSeed.purpose).toBe("paid_report");
    expect(questionCount).toBe(22);
  });

  it("contains the richer paid report prompt seed", () => {
    expect(reportPromptSeed).toMatchObject({
      slug: "paid-report-v1",
      version: 2,
      status: "published",
    });
    expect(reportPromptSeed.template).toContain("לפחות 3 פריטים");
    expect(reportPromptSeed.template).toContain("7 פריטים");
    expect(reportPromptSeed.template).toContain("דוגמאות קונקרטיות");
    expect(reportPromptSeed.template).toContain("אינו אבחון");
  });

  it("contains a 95-question matching questionnaire plus 15 visual taste cards", () => {
    const questions = matchingQuestionnaireSeed.blocks.flatMap((block) => block.questions);
    const visualQuestions = questions.filter((question) => question.usageFlags.visualTaste);
    const questionCount = questions.length;
    expect(matchingQuestionnaireSeed.purpose).toBe("matching");
    expect(matchingQuestionnaireSeed.blocks).toHaveLength(4);
    expect(questionCount).toBe(110);
    expect(visualQuestions).toHaveLength(15);
    expect(visualQuestions.every((question) => question.options?.length === 3)).toBe(true);
    expect(
      visualQuestions.every((question) =>
        question.options?.some((option) => option.value === "skip" && option.score?.visual_taste?.skip === true),
      ),
    ).toBe(true);
  });
});
