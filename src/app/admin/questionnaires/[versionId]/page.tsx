import { createServiceRoleClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { notFound } from "next/navigation";
import { saveQuestionnaireDraftVersionAction } from "../../actions/questionnaires";
import { versionStatusLabel } from "../../admin-copy";
import { QuestionnaireEditor } from "./questionnaire-editor";

export const dynamic = "force-dynamic";

type QuestionRow = {
  stable_key: string;
  prompt: string;
  question_type: "multiple_choice" | "scale" | "open_text";
  position: number;
  usage_flags: Record<string, boolean>;
  question_options?: { label: string; value: string; position: number }[];
};

type BlockRow = {
  title: string;
  position: number;
  questions?: QuestionRow[];
};

type QuestionnaireVersion = {
  id: string;
  version: number;
  status: string;
  questionnaires: { title: string; purpose: "paid_report" | "matching" } | null;
  questionnaire_blocks?: BlockRow[];
};

export default async function AdminQuestionnaireEditorPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const supabase = createServiceRoleClient();
  const { data: version } = await supabase
    .from("questionnaire_versions")
    .select(
      "id, version, status, questionnaires(title, purpose), questionnaire_blocks(title, position, questions(stable_key, prompt, question_type, position, usage_flags, question_options(label, value, position)))",
    )
    .eq("id", versionId)
    .maybeSingle<QuestionnaireVersion>();

  if (!version || !version.questionnaires) {
    notFound();
  }

  const blocks = (version.questionnaire_blocks ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((block) => ({
      title: block.title,
      questions: (block.questions ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((question) => ({
          stableKey: question.stable_key,
          prompt: question.prompt,
          questionType: question.question_type,
          usageFlags: question.usage_flags ?? {},
          options: (question.question_options ?? [])
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((option) => ({ label: option.label, value: option.value })),
        })),
    }));

  return (
    <main className="admin-editor">
      <div className="admin-editor-header">
        <div>
          <h1>עורך שאלון</h1>
          <p className="admin-editor-meta">
            {version.questionnaires.title} · גרסה {version.version} · {versionStatusLabel(version.status)}
          </p>
        </div>
        <Link className="secondary-link" href="/admin/questionnaires">
          חזרה
        </Link>
      </div>
      <QuestionnaireEditor
        versionId={version.id}
        status={version.status}
        title={version.questionnaires.title}
        purpose={version.questionnaires.purpose}
        blocks={blocks}
        saveAction={saveQuestionnaireDraftVersionAction}
      />
    </main>
  );
}
