"use client";

import { useState } from "react";
import { questionnairePurposeLabel, questionTypeLabel } from "../../admin-copy";

type QuestionType = "multiple_choice" | "scale" | "open_text";
type Option = { label: string; value: string };
type Question = {
  stableKey: string;
  prompt: string;
  questionType: QuestionType;
  usageFlags: Record<string, boolean>;
  options: Option[];
};
type Block = { title: string; questions: Question[] };

const usageFlagKeys = ["aiReportInput", "archetypeScoring", "matchingInput", "profileDealBreakerInput"] as const;

export function QuestionnaireEditor(props: {
  versionId: string;
  status: string;
  title: string;
  purpose: "paid_report" | "matching";
  blocks: Block[];
  saveAction: (formData: FormData) => Promise<void>;
}) {
  const isDraft = props.status === "draft";
  const [blocks, setBlocks] = useState<Block[]>(props.blocks);
  const payload = { title: props.title, purpose: props.purpose, blocks };

  return (
    <form className="admin-editor-form" action={props.saveAction}>
      <input type="hidden" name="versionId" value={props.versionId} />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <section className="admin-editor-section">
        <h2>{props.title}</h2>
        <p className="admin-editor-meta">{questionnairePurposeLabel(props.purpose)}</p>
      </section>
      {blocks.map((block, blockIndex) => (
        <section className="admin-editor-section" key={blockIndex}>
          <div className="admin-editor-header">
            <label>
              כותרת בלוק
              <input
                value={block.title}
                readOnly={!isDraft}
                onChange={(event) => setBlocks(updateBlock(blocks, blockIndex, { title: event.target.value }))}
                required
              />
            </label>
            {isDraft ? (
              <div className="admin-editor-actions">
                <button className="secondary-button" type="button" onClick={() => setBlocks(moveItem(blocks, blockIndex, -1))}>
                  למעלה
                </button>
                <button className="secondary-button" type="button" onClick={() => setBlocks(moveItem(blocks, blockIndex, 1))}>
                  למטה
                </button>
                <button className="secondary-button" type="button" onClick={() => setBlocks(blocks.filter((_, i) => i !== blockIndex))}>
                  הסרה
                </button>
              </div>
            ) : null}
          </div>
          {block.questions.map((question, questionIndex) => (
            <div className="admin-editor-section" key={questionIndex}>
              <div className="admin-editor-row">
                <label>
                  מפתח יציב
                  <input
                    value={question.stableKey}
                    readOnly={!isDraft}
                    onChange={(event) => setBlocks(updateQuestion(blocks, blockIndex, questionIndex, { stableKey: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  סוג
                  <select
                    value={question.questionType}
                    disabled={!isDraft}
                    onChange={(event) =>
                      setBlocks(updateQuestion(blocks, blockIndex, questionIndex, { questionType: event.target.value as QuestionType }))
                    }
                  >
                    <option value="multiple_choice">{questionTypeLabel("multiple_choice")}</option>
                    <option value="scale">{questionTypeLabel("scale")}</option>
                    <option value="open_text">{questionTypeLabel("open_text")}</option>
                  </select>
                </label>
                {isDraft ? (
                  <div className="admin-editor-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setBlocks(moveQuestion(blocks, blockIndex, questionIndex, -1))}
                    >
                      למעלה
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setBlocks(moveQuestion(blocks, blockIndex, questionIndex, 1))}
                    >
                      למטה
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setBlocks(removeQuestion(blocks, blockIndex, questionIndex))}
                    >
                      הסרה
                    </button>
                  </div>
                ) : null}
              </div>
              <label>
                שאלה
                <textarea
                  value={question.prompt}
                  readOnly={!isDraft}
                  onChange={(event) => setBlocks(updateQuestion(blocks, blockIndex, questionIndex, { prompt: event.target.value }))}
                  required
                />
              </label>
              <div className="admin-editor-actions">
                {usageFlagKeys.map((key) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={Boolean(question.usageFlags[key])}
                      disabled={!isDraft}
                      onChange={(event) =>
                        setBlocks(
                          updateQuestion(blocks, blockIndex, questionIndex, {
                            usageFlags: { ...question.usageFlags, [key]: event.target.checked },
                          }),
                        )
                      }
                    />
                    {key}
                  </label>
                ))}
              </div>
              {question.options.map((option, optionIndex) => (
                <div className="admin-editor-row" key={optionIndex}>
                  <label>
                    תווית אפשרות
                    <input
                      value={option.label}
                      readOnly={!isDraft}
                      onChange={(event) => setBlocks(updateOption(blocks, blockIndex, questionIndex, optionIndex, { label: event.target.value }))}
                    />
                  </label>
                  <label>
                    ערך
                    <input
                      value={option.value}
                      readOnly={!isDraft}
                      onChange={(event) => setBlocks(updateOption(blocks, blockIndex, questionIndex, optionIndex, { value: event.target.value }))}
                    />
                  </label>
                  {isDraft ? (
                    <div className="admin-editor-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => setBlocks(moveOption(blocks, blockIndex, questionIndex, optionIndex, -1))}
                      >
                        למעלה
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => setBlocks(moveOption(blocks, blockIndex, questionIndex, optionIndex, 1))}
                      >
                        למטה
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => setBlocks(removeOption(blocks, blockIndex, questionIndex, optionIndex))}
                      >
                        הסרה
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
              {isDraft ? (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    setBlocks(
                      updateQuestion(blocks, blockIndex, questionIndex, {
                        options: [...question.options, { label: "", value: "" }],
                      }),
                    )
                  }
                >
                  הוספת אפשרות
                </button>
              ) : null}
            </div>
          ))}
          {isDraft ? (
            <button className="secondary-button" type="button" onClick={() => setBlocks(addQuestion(blocks, blockIndex))}>
              הוספת שאלה
            </button>
          ) : null}
        </section>
      ))}
      {isDraft ? (
        <div className="admin-editor-actions">
          <button className="secondary-button" type="button" onClick={() => setBlocks([...blocks, { title: "", questions: [newQuestion()] }])}>
            הוספת בלוק
          </button>
          <button className="primary-button" type="submit">
            שמירת טיוטה
          </button>
        </div>
      ) : null}
    </form>
  );
}

function newQuestion(): Question {
  return { stableKey: "", prompt: "", questionType: "open_text", usageFlags: {}, options: [] };
}

function updateBlock(blocks: Block[], index: number, patch: Partial<Block>) {
  return blocks.map((block, i) => (i === index ? { ...block, ...patch } : block));
}

function updateQuestion(blocks: Block[], blockIndex: number, questionIndex: number, patch: Partial<Question>) {
  return blocks.map((block, i) =>
    i === blockIndex
      ? { ...block, questions: block.questions.map((question, qi) => (qi === questionIndex ? { ...question, ...patch } : question)) }
      : block,
  );
}

function updateOption(blocks: Block[], blockIndex: number, questionIndex: number, optionIndex: number, patch: Partial<Option>) {
  const block = blocks[blockIndex];
  const question = block.questions[questionIndex];
  return updateQuestion(blocks, blockIndex, questionIndex, {
    options: question.options.map((option, i) => (i === optionIndex ? { ...option, ...patch } : option)),
  });
}

function addQuestion(blocks: Block[], blockIndex: number) {
  const block = blocks[blockIndex];
  return updateBlock(blocks, blockIndex, { questions: [...block.questions, newQuestion()] });
}

function removeQuestion(blocks: Block[], blockIndex: number, questionIndex: number) {
  const block = blocks[blockIndex];
  return updateBlock(blocks, blockIndex, { questions: block.questions.filter((_, i) => i !== questionIndex) });
}

function removeOption(blocks: Block[], blockIndex: number, questionIndex: number, optionIndex: number) {
  const question = blocks[blockIndex].questions[questionIndex];
  return updateQuestion(blocks, blockIndex, questionIndex, { options: question.options.filter((_, i) => i !== optionIndex) });
}

function moveQuestion(blocks: Block[], blockIndex: number, questionIndex: number, direction: -1 | 1) {
  const block = blocks[blockIndex];
  return updateBlock(blocks, blockIndex, { questions: moveItem(block.questions, questionIndex, direction) });
}

function moveOption(blocks: Block[], blockIndex: number, questionIndex: number, optionIndex: number, direction: -1 | 1) {
  const question = blocks[blockIndex].questions[questionIndex];
  return updateQuestion(blocks, blockIndex, questionIndex, { options: moveItem(question.options, optionIndex, direction) });
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const copy = [...items];
  const item = copy[index];
  copy[index] = copy[nextIndex];
  copy[nextIndex] = item;
  return copy;
}
