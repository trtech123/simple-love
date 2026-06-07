import { z } from "zod";

const promptVersionSchema = z.object({
  template: z.string().min(1),
  model: z.string().min(1),
  modelSettings: z.record(z.unknown()),
});

export function validatePromptVersion(value: unknown) {
  const prompt = promptVersionSchema.parse(value);

  for (const variable of ["{{displayName}}", "{{answersJson}}", "{{archetypeName}}"] as const) {
    if (!prompt.template.includes(variable)) {
      throw new Error(`Prompt template must include ${variable}`);
    }
  }

  return prompt;
}
