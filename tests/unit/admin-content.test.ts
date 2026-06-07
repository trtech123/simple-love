import { describe, expect, it } from "vitest";
import { validateArchetypeVersion } from "../../src/domain/admin/archetype-admin";
import { validatePromptVersion } from "../../src/domain/admin/prompt-admin";

describe("admin content rules", () => {
  it("requires prompt templates to include core variables", () => {
    expect(
      validatePromptVersion({
        template: "{{displayName}} {{answersJson}} {{archetypeName}}",
        model: "gpt-4.1-mini",
        modelSettings: { temperature: 0.7 },
      }).model,
    ).toBe("gpt-4.1-mini");
  });

  it("rejects prompt templates missing answersJson", () => {
    expect(() =>
      validatePromptVersion({ template: "{{displayName}}", model: "gpt-4.1-mini", modelSettings: {} }),
    ).toThrow("Prompt template must include {{answersJson}}");
  });

  it("accepts complete archetype content", () => {
    const result = validateArchetypeVersion({
      name: "החם הנסגר",
      shortDescription: "קצר",
      fullDescription: "תיאור מלא",
      matchingMeaning: "משמעות התאמה",
      scoringRules: { report_q01: "a" },
    });

    expect(result.name).toBe("החם הנסגר");
  });
});
