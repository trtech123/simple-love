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

test("admin dashboard shows configurable business areas", async ({ page }) => {
  await page.goto("/admin");

  await expect(page.getByRole("heading", { name: "ניהול LovLov" })).toBeVisible();
  await expect(page.getByRole("link", { name: "שאלונים", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "פרומפטים", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "הגדרות התאמה", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "פרופיל התאמות", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "מודרציה", exact: true })).toBeVisible();
});
