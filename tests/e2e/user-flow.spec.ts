import { expect, test } from "@playwright/test";

const questionnaire = {
  id: "version-1",
  title: "×©××œ×•×Ÿ ×¨××©×•× ×™",
  questions: Array.from({ length: 22 }, (_, index) => ({
    id: `question-${index + 1}`,
    stableKey: `report_q${String(index + 1).padStart(2, "0")}`,
    prompt: `×©××œ×” ${index + 1}`,
    questionType: "multiple_choice",
    position: index + 1,
    options: [
      { id: `option-${index + 1}-a`, label: `××¤×©×¨×•×ª ${index + 1}×`, value: "a", position: 1 },
      { id: `option-${index + 1}-b`, label: `××¤×©×¨×•×ª ${index + 1}×‘`, value: "b", position: 2 },
    ],
  })),
};

const matchingQuestionnaire = {
  id: "matching-version-1",
  title: "Matching depth",
  questions: Array.from({ length: 2 }, (_, index) => ({
    id: `matching-question-${index + 1}`,
    stableKey: `match_q${String(index + 1).padStart(2, "0")}`,
    prompt: `Matching question ${index + 1}`,
    questionType: "multiple_choice",
    position: index + 1,
    options: [
      { id: `matching-option-${index + 1}-a`, label: `Match option ${index + 1}A`, value: "a", position: 1 },
      { id: `matching-option-${index + 1}-b`, label: `Match option ${index + 1}B`, value: "b", position: 2 },
    ],
  })),
};

test("user can complete the real quiz flow and reach checkout", async ({ page }) => {
  await page.route("**/api/quiz/sessions", async (route) => {
    await route.fulfill({
      json: {
        publicToken: "public-token",
        status: "started",
        questionnaire,
        answers: {},
      },
    });
  });

  await page.route("**/api/quiz/sessions/public-token", async (route) => {
    await route.fulfill({
      json: {
        publicToken: "public-token",
        status: "started",
        questionnaire,
        answers: {},
      },
    });
  });

  await page.route("**/api/quiz/sessions/public-token/answers", async (route) => {
    await route.fulfill({ json: { ok: true } });
  });

  await page.route("**/api/quiz/sessions/public-token/complete", async (route) => {
    await route.fulfill({ json: { completed: true } });
  });

  await page.route("**/api/payments/checkout", async (route) => {
    await route.fulfill({ json: { paymentId: "payment-1", redirectUrl: "/payment/return?payment=payment-1" } });
  });

  await page.route("**/api/payments/status?payment=payment-1", async (route) => {
    await route.fulfill({ json: { state: "payment_pending" } });
  });

  await page.goto("/quiz");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("1 מתוך 22")).toBeVisible();

  for (let index = 1; index <= 22; index += 1) {
    await page.getByRole("radio", { name: `××¤×©×¨×•×ª ${index}×` }).click();

    if (index < 22) {
      if (index === 11) {
        await page.getByRole("button", { name: "להמשיך" }).click();
      }
      await expect(page.getByText(`${index + 1} מתוך 22`)).toBeVisible();
    }
  }

  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>(".quiz-reference-continue")?.click();
  });
  await expect(page).toHaveURL("/payment/return?payment=payment-1");
});

test("pending payment return page shows polling status", async ({ page }) => {
  await page.goto("/payment/return?payment=e2e-pending-payment");

  await expect(page.getByRole("heading", { name: "אנחנו מאשרים את התשלום" })).toBeVisible();
  await expect(page.getByText("בודקים את סטטוס התשלום כל כמה שניות.")).toBeVisible();
});

test("quiz retries one transient answer save failure before advancing", async ({ page }) => {
  let answerCalls = 0;

  await page.route("**/api/quiz/sessions", async (route) => {
    await route.fulfill({
      json: {
        publicToken: "retry-token",
        status: "started",
        questionnaire: matchingQuestionnaire,
        answers: {},
      },
    });
  });

  await page.route("**/api/quiz/sessions/retry-token", async (route) => {
    await route.fulfill({
      json: {
        publicToken: "retry-token",
        status: "started",
        questionnaire: matchingQuestionnaire,
        answers: {},
      },
    });
  });

  await page.route("**/api/quiz/sessions/retry-token/answers", async (route) => {
    answerCalls += 1;

    if (answerCalls === 1) {
      await route.fulfill({ status: 500, json: { error: "Temporary failure" } });
      return;
    }

    await route.fulfill({ json: { ok: true } });
  });

  await page.goto("/quiz?session=retry-token");
  await expect(page.getByText("1 מתוך 2")).toBeVisible();

  await page.getByRole("radio", { name: "Match option 1A" }).click();

  await page.getByRole("button", { name: "להמשיך" }).click();
  await expect(page.getByText("2 מתוך 2")).toBeVisible();
  expect(answerCalls).toBe(2);
});

test("failed and cancelled payment return pages link back to the saved quiz session", async ({ page }) => {
  await page.goto("/payment/return?payment=e2e-failed-payment");
  await expect(page.getByRole("heading", { name: "התשלום לא עבר" })).toBeVisible();
  await expect(page.locator('a[href="/quiz?session=e2e-public-token"]')).toBeVisible();

  await page.goto("/payment/return?payment=e2e-cancelled-payment");
  await expect(page.getByRole("heading", { name: "התשלום בוטל" })).toBeVisible();
  await expect(page.locator('a[href="/quiz?session=e2e-public-token"]')).toBeVisible();
});

test("return-before-webhook: pending page polls to report_ready and opens the report", async ({ page }) => {
  // Simulates the user landing on the return page before the provider webhook
  // has arrived: the first status poll is still pending, a later one flips to
  // ready, and the poller then redirects to the report.
  // e2e-pending-payment renders the server-side pending state, which mounts the
  // client poller; the intercept below then flips the polled status to ready.
  let statusCalls = 0;
  await page.route("**/api/payments/status?payment=e2e-pending-payment", async (route) => {
    statusCalls += 1;
    if (statusCalls < 2) {
      await route.fulfill({ json: { state: "payment_pending" } });
      return;
    }
    await route.fulfill({ json: { state: "report_ready", claimToken: "claim-after-webhook" } });
  });

  await page.route("**/report/claim-after-webhook", async (route) => {
    await route.fulfill({ contentType: "text/html", body: "<h1>Report ready</h1>" });
  });

  await page.goto("/payment/return?payment=e2e-pending-payment");
  await expect(page.getByRole("heading", { name: "אנחנו מאשרים את התשלום" })).toBeVisible();

  // Poller runs every 3s; the second call flips to ready and redirects.
  await expect(page).toHaveURL("/report/claim-after-webhook", { timeout: 15000 });
});

test("return page shows report_failed when payment succeeded but generation failed", async ({ page }) => {
  await page.route("**/api/payments/status?payment=e2e-pending-payment", async (route) => {
    await route.fulfill({ json: { state: "report_failed" } });
  });

  await page.goto("/payment/return?payment=e2e-pending-payment");
  await expect(page.getByText("הפקת הדוח נכשלה.")).toBeVisible();
});

test("user can still navigate report and matches placeholders", async ({ page }) => {
  await page.goto("/report/mock-token");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.goto("/matches");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("user completes matching profile before starting matching questionnaire", async ({ page, context }) => {
  await context.addCookies([
    {
      name: "lovlov_e2e_user_id",
      value: "user-a",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);

  await page.route("**/api/profile/matching/config", async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        data: {
          versionId: "default-code",
          version: 1,
          config: {
            direction: "rtl",
            birthYear: { minAge: 18, maxAge: 120 },
            preferredAge: { min: 18, max: 120 },
            preferredDistanceKm: { min: 1, max: 500, default: 50 },
            genderOptions: [
              { value: "woman", label: "אישה" },
              { value: "man", label: "גבר" },
            ],
            interestedInOptions: [
              { value: "woman", label: "נשים" },
              { value: "man", label: "גברים" },
            ],
            relationshipIntentions: [{ value: "serious", label: "קשר רציני" }],
            dealBreakers: [{ value: "smoking", label: "עישון" }],
          },
        },
      },
    });
  });

  await page.route("**/api/profile/matching", async (route) => {
    if (route.request().url().includes("/api/profile/matching/config")) {
      await route.fulfill({
        json: {
          ok: true,
          data: {
            versionId: "default-code",
            version: 1,
            config: {
              direction: "rtl",
              birthYear: { minAge: 18, maxAge: 120 },
              preferredAge: { min: 18, max: 120 },
              preferredDistanceKm: { min: 1, max: 500, default: 50 },
              genderOptions: [
                { value: "woman", label: "אישה" },
                { value: "man", label: "גבר" },
              ],
              interestedInOptions: [
                { value: "woman", label: "נשים" },
                { value: "man", label: "גברים" },
              ],
              relationshipIntentions: [{ value: "serious", label: "קשר רציני" }],
              dealBreakers: [{ value: "smoking", label: "עישון" }],
            },
          },
        },
      });
      return;
    }

    if (route.request().method() === "GET") {
      await route.fulfill({
        json: {
          ok: true,
          data: {
            complete: false,
            profile: null,
            dealBreakers: [],
          },
        },
      });
      return;
    }

    await route.fulfill({ json: { ok: true, data: { complete: true } } });
  });

  await page.route("**/api/matching/sessions/current", async (route) => {
    await route.fulfill({ status: 404, json: { error: "No matching session exists" } });
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

  await page.route("**/api/matching/sessions/matching-token/answers", async (route) => {
    await route.fulfill({ json: { ok: true } });
  });

  await page.route("**/api/matching/sessions/matching-token/complete", async (route) => {
    await route.fulfill({ json: { completed: true, matchCount: 1 } });
  });

  await page.goto("/profile/matching");
  await page.getByLabel("שנת לידה").fill("1994");
  await page.getByLabel("מיקום").selectOption("tel-aviv");
  await page.getByLabel('רדיוס מרחק בק"מ').fill("75");
  await page.getByLabel("גיל מינימלי").fill("28");
  await page.getByLabel("גיל מקסימלי").fill("38");
  await page.getByRole("radio", { name: "אישה" }).check();
  await page.getByRole("radio", { name: "גברים" }).check();
  await page.getByRole("radio", { name: "קשר רציני" }).check();
  await page.getByRole("checkbox", { name: "עישון" }).check();
  await page.getByRole("button", { name: "שמירה והמשך" }).click();

  await expect(page).toHaveURL(/\/matching\/questionnaire/);
  await expect(page.getByText("1 מתוך 2")).toBeVisible();

  await page.getByRole("radio", { name: "Match option 1A" }).click();
  await expect(page.getByText("2 מתוך 2")).toBeVisible();

  await page.getByRole("radio", { name: "Match option 2A" }).click();
  await page.locator(".quiz-actions .primary-button").click();

  await expect(page).toHaveURL(/\/matches$/);
  await expect(page.getByRole("heading", { name: "User B" })).toBeVisible();
  await expect(page.getByText("93%")).toBeVisible();
  await expect(page.getByText("Long-term relationship - Jerusalem")).toBeVisible();
  await expect(page.getByRole("button", { name: "שיחה" })).toBeVisible();
});

test("matches page points users to the next required funnel step", async ({ page, context }) => {
  await context.addCookies([
    {
      name: "lovlov_e2e_user_id",
      value: "user-incomplete-profile",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
  await page.goto("/matches");
  await expect(page.locator('a[href="/profile/matching"]')).toBeVisible();

  await context.clearCookies();
  await context.addCookies([
    {
      name: "lovlov_e2e_user_id",
      value: "user-profile-only",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
  await page.goto("/matches");
  await expect(page.locator('a[href="/matching/questionnaire"]')).toBeVisible();
});
