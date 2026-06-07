import { expect, test } from "@playwright/test";

import {
  createE2eAdminAccount,
  deleteE2eAdminAccount,
  signInE2eAdmin,
  type E2eAdminAccount,
} from "./admin-auth";

let adminAccount: E2eAdminAccount | undefined;

test.beforeAll(async () => {
  adminAccount = await createE2eAdminAccount();
});

test.afterAll(async () => {
  await deleteE2eAdminAccount(adminAccount);
});

test.beforeEach(async ({ context }) => {
  if (!adminAccount) throw new Error("E2E admin account was not created");
  await signInE2eAdmin(context, adminAccount);
});

const pages = [
  ["שאלונים", "/admin/questionnaires", "ניהול שאלונים"],
  ["ארכיטיפים", "/admin/archetypes", "ניהול ארכיטיפים"],
  ["פרומפטים", "/admin/prompts", "ניהול פרומפטים"],
  ["הגדרות התאמה", "/admin/matching", "הגדרות התאמה"],
  ["פרופיל התאמות", "/admin/profile-form", "פרופיל התאמות"],
  ["תשלומים", "/admin/payments", "ניהול תשלומים"],
  ["דוחות", "/admin/reports", "ניהול דוחות"],
  ["משתמשים", "/admin/users", "ניהול משתמשים"],
  ["מודרציה", "/admin/moderation", "מודרציה"],
] as const;

test("admin navigation exposes all management areas", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "ניהול LovLov" })).toBeVisible();

  for (const [label] of pages) {
    await expect(page.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
});

for (const [, url, heading] of pages) {
  test(`admin page ${url} renders`, async ({ page }) => {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  });
}
