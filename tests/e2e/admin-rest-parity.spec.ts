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

const adminSections = [
  "/admin/questionnaires",
  "/admin/prompts",
  "/admin/archetypes",
  "/admin/payments",
  "/admin/reports",
  "/admin/users",
  "/admin/moderation",
] as const;

test("admin REST parity sections load without server errors", async ({ page }) => {
  const serverErrors: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/admin") && response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  for (const section of adminSections) {
    const response = await page.goto(section);
    expect(response?.status(), section).toBeLessThan(500);
    await expect(page.locator("main")).toBeVisible();
  }

  expect(serverErrors).toEqual([]);
});
