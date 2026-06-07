import { createServiceRoleClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProfileFormEditor } from "./profile-form-editor";

export const dynamic = "force-dynamic";

type VersionRow = {
  id: string;
  version: number;
  status: string;
  config: unknown;
  profile_form_configs: { slug: string } | null;
};

export default async function AdminProfileFormEditorPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const supabase = createServiceRoleClient();
  const { data: version } = await supabase
    .from("profile_form_config_versions")
    .select("id, version, status, config, profile_form_configs(slug)")
    .eq("id", versionId)
    .maybeSingle<VersionRow>();

  if (!version) {
    notFound();
  }

  return (
    <main className="admin-editor">
      <div className="admin-editor-header">
        <div>
          <h1>עריכת פרופיל התאמות</h1>
          <p className="admin-editor-meta">
            {version.profile_form_configs?.slug ?? "default"} · גרסה {version.version} · {version.status}
          </p>
        </div>
        <Link className="secondary-link" href="/admin/profile-form">
          חזרה
        </Link>
      </div>
      <ProfileFormEditor
        versionId={version.id}
        version={version.version}
        status={version.status}
        config={version.config}
      />
    </main>
  );
}
