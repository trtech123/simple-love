import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/e2e/chat-fixture/reset");
  expect(response.status()).toBe(200);
});

test("blocking a chat disables both directions", async ({ browser, context, page }) => {
  await context.addCookies([
    {
      name: "lovlov_e2e_user_id",
      value: "user-a",
      url: "http://127.0.0.1:3100",
    },
  ]);

  await page.goto("/matches");
  const chatButton = page.getByRole("button", { name: "שיחה" });
  await expect(chatButton).toBeEnabled();
  await chatButton.click();
  await expect(page).toHaveURL(/\/chat\/conversation-1$/);

  await page.getByRole("button", { name: "חסימה" }).click();
  await expect(page.getByText("החסימה נשמרה.")).toBeVisible();
  await expect(page.locator("#chat-message")).toHaveCount(0);

  const userBContext = await browser.newContext();
  await userBContext.addCookies([
    {
      name: "lovlov_e2e_user_id",
      value: "user-b",
      url: "http://127.0.0.1:3100",
    },
  ]);

  const userBPage = await userBContext.newPage();
  await userBPage.goto("/matches");
  const blockedSend = await userBPage.evaluate(async () => {
    const response = await fetch("/api/conversations/conversation-1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "blocked reply" }),
    });

    return {
      status: response.status,
      body: await response.json(),
    };
  });
  expect(blockedSend.status).toBe(403);
  expect(blockedSend.body).toMatchObject({ code: "conversation_blocked" });

  await userBContext.close();
});
