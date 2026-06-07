import Link from "next/link";
import type { ReactNode } from "react";

import { requireAdminPageAccess } from "./guard";

const links = [
  ["סקירה", "/admin"],
  ["שאלונים", "/admin/questionnaires"],
  ["פרומפטים", "/admin/prompts"],
  ["ארכיטיפים", "/admin/archetypes"],
  ["הגדרות התאמה", "/admin/matching"],
  ["פרופיל התאמות", "/admin/profile-form"],
  ["תשלומים", "/admin/payments"],
  ["דוחות", "/admin/reports"],
  ["משתמשים", "/admin/users"],
  ["מודרציה", "/admin/moderation"],
] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminPageAccess();

  return (
    <div className="admin-layout" dir="rtl">
      <aside className="admin-sidebar" aria-label="ניווט ניהול">
        {links.map(([label, href]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </aside>
      <div className="admin-content">{children}</div>
    </div>
  );
}
