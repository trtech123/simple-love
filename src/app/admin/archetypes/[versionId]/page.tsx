import { createServiceRoleClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { notFound } from "next/navigation";
import { saveArchetypeDraftVersionAction } from "../../actions/archetypes";
import { versionStatusLabel } from "../../admin-copy";

export const dynamic = "force-dynamic";

type ArchetypeVersion = {
  id: string;
  version: number;
  status: string;
  name: string;
  short_description: string;
  full_description: string;
  matching_meaning: string;
  scoring_rules: Record<string, unknown>;
  archetypes: { stable_key: string } | null;
};

export default async function AdminArchetypeEditorPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const supabase = createServiceRoleClient();
  const { data: archetype } = await supabase
    .from("archetype_versions")
    .select("id, version, status, name, short_description, full_description, matching_meaning, scoring_rules, archetypes(stable_key)")
    .eq("id", versionId)
    .maybeSingle<ArchetypeVersion>();

  if (!archetype) {
    notFound();
  }

  const isDraft = archetype.status === "draft";

  return (
    <main className="admin-editor">
      <div className="admin-editor-header">
        <div>
          <h1>עורך ארכיטיפ</h1>
          <p className="admin-editor-meta">
            {archetype.archetypes?.stable_key ?? ""} · גרסה {archetype.version} · {versionStatusLabel(archetype.status)}
          </p>
        </div>
        <Link className="secondary-link" href="/admin/archetypes">
          חזרה
        </Link>
      </div>
      <form className="admin-editor-form" action={saveArchetypeDraftVersionAction}>
        <input type="hidden" name="versionId" value={archetype.id} />
        <label>
          שם
          <input name="name" defaultValue={archetype.name} readOnly={!isDraft} required />
        </label>
        <label>
          תיאור קצר
          <textarea name="shortDescription" defaultValue={archetype.short_description} readOnly={!isDraft} required />
        </label>
        <label>
          תיאור מלא
          <textarea name="fullDescription" defaultValue={archetype.full_description} readOnly={!isDraft} required />
        </label>
        <label>
          משמעות להתאמות
          <textarea name="matchingMeaning" defaultValue={archetype.matching_meaning} readOnly={!isDraft} required />
        </label>
        <label>
          כללי ניקוד JSON
          <textarea
            name="scoringRules"
            defaultValue={JSON.stringify(archetype.scoring_rules ?? {}, null, 2)}
            readOnly={!isDraft}
            required
          />
        </label>
        {isDraft ? (
          <button className="primary-button" type="submit">
            שמירת טיוטה
          </button>
        ) : null}
      </form>
    </main>
  );
}
