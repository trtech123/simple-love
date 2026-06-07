import { z } from "zod";

const archetypeVersionSchema = z.object({
  name: z.string().min(1),
  shortDescription: z.string().min(1),
  fullDescription: z.string().min(1),
  matchingMeaning: z.string().min(1),
  scoringRules: z.record(z.unknown()),
});

export function validateArchetypeVersion(value: unknown) {
  return archetypeVersionSchema.parse(value);
}
