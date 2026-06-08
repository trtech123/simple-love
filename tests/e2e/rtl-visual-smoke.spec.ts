import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

import {
  createE2eAdminAccount,
  deleteE2eAdminAccount,
  signInE2eAdmin,
  type E2eAdminAccount,
} from "./admin-auth";

let adminAccount: E2eAdminAccount | undefined;

const screenshotRoot = path.join("screenshots", "2026-06-06-hebrew-platform-polish");

const publicRoutes = [
  "/",
  "/quiz",
  "/login",
  "/register",
  "/profile/matching",
  "/matching/questionnaire",
  "/matches",
  "/chat/missing-conversation",
] as const;

const adminRoutes = [
  "/admin",
  "/admin/questionnaires",
  "/admin/prompts",
  "/admin/archetypes",
  "/admin/matching",
  "/admin/profile-form",
  "/admin/payments",
  "/admin/reports",
  "/admin/users",
  "/admin/moderation",
] as const;

const viewports = [
  { label: "mobile", width: 390, height: 844 },
  { label: "tablet", width: 768, height: 1024 },
  { label: "desktop", width: 1440, height: 1000 },
] as const;

test.beforeAll(async () => {
  adminAccount = await createE2eAdminAccount();
  await fs.mkdir(screenshotRoot, { recursive: true });
  await Promise.all(viewports.map((viewport) => fs.mkdir(path.join(screenshotRoot, viewport.label), { recursive: true })));
});

test.afterAll(async () => {
  await deleteE2eAdminAccount(adminAccount);
});

for (const viewport of viewports) {
  test.describe(`rtl visual smoke ${viewport.label}`, () => {
    test.use({ viewport });

    test("public routes are rtl and have no horizontal overflow", async ({ context, page }) => {
      await setE2eUserCookie(context);

      for (const route of publicRoutes) {
        await assertResponsiveRoute(page, route, viewport.label);
      }
    });

    test("admin routes are rtl and have no horizontal overflow", async ({ context, page }) => {
      if (!adminAccount) throw new Error("E2E admin account was not created");
      await signInE2eAdmin(context, adminAccount);
      await setE2eUserCookie(context);

      for (const route of adminRoutes) {
        await assertResponsiveRoute(page, route, viewport.label);
      }
    });
  });
}

async function setE2eUserCookie(context: BrowserContext) {
  await context.addCookies([
    {
      name: "lovlov_e2e_user_id",
      value: "user-a",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
}

async function assertResponsiveRoute(page: Page, route: string, viewportLabel: string) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response?.status(), route).toBeLessThan(500);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return Math.max(root.scrollWidth, body.scrollWidth) > root.clientWidth + 1;
  });
  expect(overflow, route).toBe(false);

  const fileName = `${routeName(route)}.png`;
  await page.screenshot({
    path: path.join(screenshotRoot, viewportLabel, fileName),
    fullPage: true,
  });
}

function routeName(route: string) {
  if (route === "/") return "home";
  return route.replace(/^\/+/, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/-$/, "");
}
