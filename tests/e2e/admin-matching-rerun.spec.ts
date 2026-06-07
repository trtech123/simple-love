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

test("admin matching exposes settings versions and rerun controls", async ({ page }) => {
  await page.goto("/admin/matching");

  await expect(page.getByRole("heading", { name: "הגדרות התאמה" })).toBeVisible();
  await expect(page.getByRole("button", { name: "חישוב מחדש למשתמש" })).toBeVisible();
  await expect(page.getByRole("button", { name: "חישוב מחדש לכל המשתמשים" })).toBeVisible();
});
