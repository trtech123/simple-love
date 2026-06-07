export type ReportAnswerInput = {
  question: string;
  answer: string;
};

export type ReportPromptInput = {
  template: string;
  displayName: string;
  archetypeName: string;
  answers: ReportAnswerInput[];
};
