import type { ReportPromptInput } from "./types";

export function assembleReportPrompt(input: ReportPromptInput): string {
  return input.template
    .replaceAll("{{displayName}}", input.displayName)
    .replaceAll("{{archetypeName}}", input.archetypeName)
    .replaceAll("{{answersJson}}", JSON.stringify(input.answers, null, 2));
}
