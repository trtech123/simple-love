import { describe, expect, it } from "vitest";
import {
  createReplacementCheckoutAction,
  createReplacementCheckoutFormAction,
  markPaymentCancelledAction,
  markPaymentFailedAction,
  reconcilePaymentAction,
} from "../../src/app/admin/actions/payments";
import {
  archiveMatchSettingsVersionAction,
  buildMatchSettingsPublishAction,
  createMatchSettingsDraftVersionAction,
  publishMatchSettingsVersionAction,
  saveMatchSettingsDraftVersionAction,
} from "../../src/app/admin/actions/matching";
import {
  archivePromptVersionAction,
  buildPromptPublishAction,
  createPromptDraftVersionAction,
  publishPromptVersionAction,
  savePromptDraftVersionAction,
} from "../../src/app/admin/actions/prompts";
import {
  archiveQuestionnaireVersionAction,
  buildQuestionnairePublishAction,
  createQuestionnaireDraftVersionAction,
  publishQuestionnaireVersionAction,
  saveQuestionnaireDraftVersionAction,
} from "../../src/app/admin/actions/questionnaires";
import {
  archiveArchetypeVersionAction,
  createArchetypeDraftVersionAction,
  publishArchetypeVersionAction,
  saveArchetypeDraftVersionAction,
} from "../../src/app/admin/actions/archetypes";
import { retryReportAction } from "../../src/app/admin/actions/reports";

describe("admin action contracts", () => {
  it("builds questionnaire publish action", () => {
    expect(buildQuestionnairePublishAction("version-1", "admin-1")).toEqual({
      type: "questionnaire.publish",
      versionId: "version-1",
      actorUserId: "admin-1",
    });
  });

  it("builds prompt publish action", () => {
    expect(buildPromptPublishAction("prompt-version-1", "admin-1").type).toBe("prompt.publish");
  });

  it("builds match settings publish action", () => {
    expect(buildMatchSettingsPublishAction("settings-version-1", "admin-1").type).toBe("match_settings.publish");
  });

  it("exports form-backed admin server actions", () => {
    expect(typeof publishPromptVersionAction).toBe("function");
    expect(typeof archivePromptVersionAction).toBe("function");
    expect(typeof publishArchetypeVersionAction).toBe("function");
    expect(typeof archiveArchetypeVersionAction).toBe("function");
    expect(typeof publishQuestionnaireVersionAction).toBe("function");
    expect(typeof archiveQuestionnaireVersionAction).toBe("function");
    expect(typeof publishMatchSettingsVersionAction).toBe("function");
    expect(typeof archiveMatchSettingsVersionAction).toBe("function");
    expect(typeof createPromptDraftVersionAction).toBe("function");
    expect(typeof savePromptDraftVersionAction).toBe("function");
    expect(typeof createArchetypeDraftVersionAction).toBe("function");
    expect(typeof saveArchetypeDraftVersionAction).toBe("function");
    expect(typeof createQuestionnaireDraftVersionAction).toBe("function");
    expect(typeof saveQuestionnaireDraftVersionAction).toBe("function");
    expect(typeof createMatchSettingsDraftVersionAction).toBe("function");
    expect(typeof saveMatchSettingsDraftVersionAction).toBe("function");
    expect(typeof retryReportAction).toBe("function");
    expect(typeof reconcilePaymentAction).toBe("function");
    expect(typeof markPaymentFailedAction).toBe("function");
    expect(typeof markPaymentCancelledAction).toBe("function");
    expect(typeof createReplacementCheckoutAction).toBe("function");
    expect(typeof createReplacementCheckoutFormAction).toBe("function");
  });
});
