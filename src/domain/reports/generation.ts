import { createHash } from "node:crypto";
import { createClaimToken } from "../claims/claim-token";
import { assembleReportPrompt } from "./prompt";
import { validateReportOutput, type ReportOutput } from "./report-output";
import type { ReportAnswerInput } from "./types";

export type ReportGenerationInput = {
  quizSessionId: string;
  promptVersionId: string;
  archetypeVersionId: string | null;
  template: string;
  model: string;
  modelSettings: Record<string, unknown>;
  displayName: string;
  archetypeName: string;
  answers: ReportAnswerInput[];
};

export type ReportGenerationRepository = {
  getReportInput(quizSessionId: string): Promise<ReportGenerationInput>;
  createGeneratingReport(input: {
    quizSessionId: string;
    promptVersionId: string;
    archetypeVersionId: string | null;
    inputSnapshot: Record<string, unknown>;
  }): Promise<{ reportId: string; reportNumber: string }>;
  completeReport(reportId: string, output: ReportOutput): Promise<void>;
  failReport(reportId: string, message: string): Promise<void>;
  createClaimToken(input: {
    quizSessionId: string;
    reportId: string;
    rawToken: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<string>;
};

export async function generatePaidReport(
  repository: ReportGenerationRepository,
  input: {
    quizSessionId: string;
    generateText: (input: {
      prompt: string;
      model: string;
      modelSettings: Record<string, unknown>;
    }) => Promise<unknown>;
    now?: Date;
  },
) {
  const reportInput = await repository.getReportInput(input.quizSessionId);
  const prompt = assembleReportPrompt(reportInput);
  const { reportId, reportNumber } = await repository.createGeneratingReport({
    quizSessionId: reportInput.quizSessionId,
    promptVersionId: reportInput.promptVersionId,
    archetypeVersionId: reportInput.archetypeVersionId,
    inputSnapshot: {
      prompt,
      promptVersionId: reportInput.promptVersionId,
      archetypeVersionId: reportInput.archetypeVersionId,
      answers: reportInput.answers,
      model: reportInput.model,
      modelSettings: reportInput.modelSettings,
    },
  });

  try {
    const output = validateReportOutput(
      await input.generateText({
        prompt,
        model: reportInput.model,
        modelSettings: reportInput.modelSettings,
      }),
    );
    await repository.completeReport(reportId, output);
    const token = await createClaimToken();
    const expiresAt = new Date((input.now ?? new Date()).getTime() + 30 * 24 * 60 * 60 * 1000);
    const rawClaimToken = await repository.createClaimToken({
      quizSessionId: reportInput.quizSessionId,
      reportId,
      rawToken: token.rawToken,
      tokenHash: token.tokenHash,
      expiresAt,
    });

    return {
      reportId,
      reportNumber,
      claimToken: rawClaimToken || token.rawToken,
    };
  } catch (error) {
    await repository.failReport(reportId, error instanceof Error ? error.message : "Report generation failed");
    throw error;
  }
}

export function createReportNumber(quizSessionId: string, now: Date = new Date()) {
  const digest = createHash("sha1").update(`${quizSessionId}:${now.toISOString()}`).digest("hex").slice(0, 8);
  return `LL-${now.getUTCFullYear()}-${digest.toUpperCase()}`;
}
