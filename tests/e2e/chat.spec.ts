import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/e2e/chat-fixture/reset");
  expect(response.status()).toBe(200);
});

test("chat page shows a clear unauthenticated state", async ({ page }) => {
  await page.goto("/chat/conversation-1");

  await expect(page.getByRole("heading", { name: "שיחה" })).toBeVisible();
  await expect(page.getByText("צריך להתחבר כדי לפתוח את השיחה הזאת.")).toBeVisible();
  await expect(page.getByRole("link", { name: "התחברות" })).toBeVisible();
});

test("registered user opens a match chat, receives inbound messages, and reports", async ({ context, page, request }) => {
  await context.addCookies([
    {
      name: "lovlov_e2e_user_id",
      value: "user-a",
      url: "http://127.0.0.1:3100",
    },
  ]);

  await page.goto("/matches");

  await expect(page.getByRole("heading", { name: "User B" })).toBeVisible();
  await expect(page.getByText("Aligned emotional profile.")).toBeVisible();

  await page.getByRole("button", { name: "שיחה" }).click();
  await expect(page).toHaveURL(/\/chat\/conversation-1$/);
  await expect(page.getByRole("heading", { name: "User B" })).toBeVisible();

  await page.getByLabel("הודעה").fill("Hello from user A");
  await page.getByRole("button", { name: "שליחה" }).click();
  await expect(page.getByText("Hello from user A")).toBeVisible();

  const inbound = await request.post("/api/e2e/conversations/conversation-1/messages", {
    data: { body: "Hello from user B" },
  });
  expect(inbound.status()).toBe(200);
  await expect(page.getByText("Hello from user B")).toBeVisible();

  await page.getByLabel("דיווח על User B").fill("Unsafe behavior");
  await page.getByRole("button", { name: "דיווח" }).click();
  await expect(page.getByText("הדיווח נשלח.")).toBeVisible();
});
