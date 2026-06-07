import { createServiceRoleClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { notFound } from "next/navigation";
import { savePromptDraftVersionAction } from "../../actions/prompts";
import { versionStatusLabel } from "../../admin-copy";

export const dynamic = "force-dynamic";

type PromptVersion = {
  id: string;
  slug: string;
  version: number;
  status: string;
  template: string;
  model: string;
  model_settings: Record<string, unknown>;
};

export default async function AdminPromptEditorPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const supabase = createServiceRoleClient();
  const { data: prompt } = await supabase
    .from("prompt_versions")
    .select("id, slug, version, status, template, model, model_settings")
    .eq("id", versionId)
    .maybeSingle<PromptVersion>();

  if (!prompt) {
    notFound();
  }

  const isDraft = prompt.status === "draft";

  return (
    <main className="admin-editor">
      <div className="admin-editor-header">
        <div>
          <h1>עורך פרומפט</h1>
          <p className="admin-editor-meta">
            {prompt.slug} · גרסה {prompt.version} · {versionStatusLabel(prompt.status)}
          </p>
        </div>
        <Link className="secondary-link" href="/admin/prompts">
          חזרה
        </Link>
      </div>
      <form className="admin-editor-form" action={savePromptDraftVersionAction}>
        <input type="hidden" name="versionId" value={prompt.id} />
        <label>
          תבנית
          <textarea name="template" defaultValue={prompt.template} readOnly={!isDraft} required />
        </label>
        <label>
          מודל
          <input name="model" defaultValue={prompt.model} readOnly={!isDraft} required />
        </label>
        <label>
          הגדרות מודל JSON
          <textarea
            name="modelSettings"
            defaultValue={JSON.stringify(prompt.model_settings ?? {}, null, 2)}
            readOnly={!isDraft}
            required
          />
        </label>
        <p className="admin-editor-meta">משתנים נדרשים: {"{{displayName}}"}, {"{{answersJson}}"}, {"{{archetypeName}}"}</p>
        {isDraft ? (
          <button className="primary-button" type="submit">
            שמירת טיוטה
          </button>
        ) : null}
      </form>
    </main>
  );
}
