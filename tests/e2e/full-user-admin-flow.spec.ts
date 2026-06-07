import { expect, test } from "@playwright/test";

import {
  createE2eAdminAccount,
  deleteE2eAdminAccount,
  signInE2eAdmin,
  type E2eAdminAccount,
} from "./admin-auth";

let adminAccount: E2eAdminAccount | undefined;

const matchingQuestionnaire = {
  id: "matching-version-1",
  title: "שאלון עומק להתאמות",
  questions: [
    {
      id: "matching-question-1",
      stableKey: "match_q01",
      prompt: "מה חשוב לך בקשר?",
      questionType: "multiple_choice",
      position: 1,
      options: [
        { id: "matching-option-1-a", label: "תקשורת פתוחה", value: "a", position: 1 },
        { id: "matching-option-1-b", label: "שגרה יציבה", value: "b", position: 2 },
      ],
    },
  ],
};

test.beforeAll(async () => {
  adminAccount = await createE2eAdminAccount();
});

test.afterAll(async () => {
  await deleteE2eAdminAccount(adminAccount);
});

test.beforeEach(async ({ context }) => {
  if (!adminAccount) throw new Error("E2E admin account was not created");
  await signInE2eAdmin(context, adminAccount);
  await context.addCookies([
    {
      name: "lovlov_e2e_user_id",
      value: "user-a",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
});

test("paid user reaches matches and admin can reach matching controls", async ({ page }) => {
  await page.route("**/api/matching/sessions/current", async (route) => {
    await route.fulfill({ status: 404, json: { error: "אין שאלון התאמות פעיל." } });
  });
  await page.route("**/api/matching/sessions", async (route) => {
    await route.fulfill({
      json: {
        publicToken: "matching-token",
        status: "started",
        questionnaire: matchingQuestionnaire,
        answers: {},
      },
    });
  });

  await page.goto("/quiz");
  await expect(page.getByRole("heading", { name: "שאלון ראשוני" })).toBeVisible();

  await page.goto("/profile/matching");
  await expect(page.getByRole("heading", { name: "פרופיל התאמה" })).toBeVisible();

  await page.goto("/matching/questionnaire");
  await expect(page.getByRole("heading", { name: "שאלון עומק להתאמות" })).toBeVisible();

  await page.goto("/matches");
  await expect(page.getByRole("heading", { name: "ההתאמות שלך" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "User B" })).toBeVisible();
  await expect(page.getByText("93%")).toBeVisible();

  await page.goto("/admin/matching");
  await expect(page.getByRole("heading", { name: "הגדרות התאמה" })).toBeVisible();
  await expect(page.getByRole("button", { name: "חישוב מחדש לכל המשתמשים" })).toBeVisible();
});
