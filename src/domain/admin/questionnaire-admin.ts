import { z } from "zod";

const questionOptionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

const questionSchema = z.object({
  stableKey: z.string().min(1),
  prompt: z.string().min(1),
  questionType: z.enum(["multiple_choice", "scale", "open_text"]),
  options: z.array(questionOptionSchema).default([]),
  usageFlags: z.object({
    aiReportInput: z.boolean().optional(),
    archetypeScoring: z.boolean().optional(),
    matchingInput: z.boolean().optional(),
    profileDealBreakerInput: z.boolean().optional(),
  }),
});

const questionnaireDraftSchema = z.object({
  title: z.string().min(1),
  purpose: z.enum(["paid_report", "matching"]),
  blocks: z
    .array(
      z.object({
        title: z.string().min(1),
        questions: z.array(questionSchema).min(1),
      }),
    )
    .min(1),
});

export type QuestionnaireDraft = z.infer<typeof questionnaireDraftSchema>;

export function validateQuestionnaireDraft(value: unknown): QuestionnaireDraft {
  const draft = questionnaireDraftSchema.parse(value);

  for (const block of draft.blocks) {
    for (const question of block.questions) {
      if (question.questionType === "multiple_choice" && question.options.length < 2) {
        throw new Error("Multiple choice questions require at least two options");
      }
    }
  }

  return draft;
}

export function buildQuestionnaireReplacementPayload(value: QuestionnaireDraft) {
  return {
    title: value.title,
    purpose: value.purpose,
    blocks: value.blocks.map((block, blockIndex) => ({
      title: block.title,
      position: blockIndex + 1,
      questions: block.questions.map((question, questionIndex) => ({
        stableKey: question.stableKey,
        prompt: question.prompt,
        questionType: question.questionType,
        usageFlags: question.usageFlags,
        position: questionIndex + 1,
        options: question.options.map((option, optionIndex) => ({
          label: option.label,
          value: option.value,
          position: optionIndex + 1,
        })),
      })),
    })),
  };
}

export function canPublishQuestionnaire(input: {
  blockCount: number;
  questionCount: number;
  status: "draft" | "published" | "archived";
}): boolean {
  return input.status === "draft" && input.blockCount > 0 && input.questionCount > 0;
}
