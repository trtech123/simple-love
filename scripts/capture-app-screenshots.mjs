import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.join(rootDir, "screenshots", `app-screens-${timestamp}`);
const viewports = [
  { name: "desktop", width: 1440, height: 1000, deviceScaleFactor: 1 },
  { name: "mobile", width: 390, height: 844, deviceScaleFactor: 1 },
];

const paidQuestionnaire = buildQuestionnaire({
  id: "paid-questionnaire",
  title: "Initial questionnaire",
  prefix: "question",
  total: 5,
});

const matchingQuestionnaire = buildQuestionnaire({
  id: "matching-questionnaire",
  title: "Matching depth",
  prefix: "matching-question",
  total: 3,
});

const screens = [
  { slug: "home", path: "/" },
  {
    slug: "quiz-start",
    path: "/quiz",
    setup: async (page) => {
      await page.route("**/api/quiz/sessions", async (route) => {
        await route.fulfill({
          json: {
            publicToken: "screenshot-paid-session",
            status: "started",
            questionnaire: paidQuestionnaire,
            answers: {},
          },
        });
      });
    },
    waitForText: "Question 1",
  },
  { slug: "payment-mock", path: "/payment/mock?session=screenshot-paid-session" },
  { slug: "payment-return-pending", path: "/payment/return?payment=e2e-pending-payment" },
  { slug: "payment-return-failed", path: "/payment/return?payment=e2e-failed-payment" },
  {
    slug: "payment-return-cancelled",
    path: "/payment/return?payment=e2e-cancelled-payment",
  },
  { slug: "report-unavailable", path: "/report/mock-token" },
  { slug: "register-claim", path: "/register?claim=mock-token" },
  { slug: "matches-signed-out", path: "/matches" },
  {
    slug: "matches-profile-required",
    path: "/matches",
    cookies: [{ name: "lovlov_e2e_user_id", value: "user-incomplete-profile" }],
  },
  {
    slug: "matches-questionnaire-required",
    path: "/matches",
    cookies: [{ name: "lovlov_e2e_user_id", value: "user-profile-only" }],
  },
  {
    slug: "matches-list",
    path: "/matches",
    cookies: [{ name: "lovlov_e2e_user_id", value: "user-a" }],
    waitForText: "User B",
  },
  { slug: "matching-profile-signed-out", path: "/profile/matching" },
  {
    slug: "matching-profile-form",
    path: "/profile/matching",
    cookies: [{ name: "lovlov_e2e_user_id", value: "user-a" }],
  },
  {
    slug: "matching-questionnaire-start",
    path: "/matching/questionnaire",
    cookies: [{ name: "lovlov_e2e_user_id", value: "user-a" }],
    setup: async (page) => {
      await page.route("**/api/matching/sessions/current", async (route) => {
        await route.fulfill({ status: 404, json: { error: "No matching session exists" } });
      });
      await page.route("**/api/matching/sessions", async (route) => {
        await route.fulfill({
          json: {
            publicToken: "screenshot-matching-session",
            status: "started",
            questionnaire: matchingQuestionnaire,
            answers: {},
          },
        });
      });
    },
    waitForText: "Question 1",
  },
  { slug: "chat-signed-out", path: "/chat/conversation-1" },
  {
    slug: "chat-authenticated-unavailable",
    path: "/chat/conversation-1",
    cookies: [{ name: "lovlov_e2e_user_id", value: "user-a" }],
  },
];

let serverProcess;

try {
  const port = await findOpenPort(3100);
  const baseURL = `http://127.0.0.1:${port}`;
  await mkdir(outputDir, { recursive: true });

  serverProcess = await startServer(port, baseURL);
  const browser = await chromium.launch();
  const manifest = [];

  for (const viewport of viewports) {
    const viewportDir = path.join(outputDir, viewport.name);
    await mkdir(viewportDir, { recursive: true });

    for (const screen of screens) {
      const context = await browser.newContext({
        baseURL,
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
      });

      if (screen.cookies?.length) {
        await context.addCookies(
          screen.cookies.map((cookie) => ({
            ...cookie,
            url: baseURL,
          })),
        );
      }

      const page = await context.newPage();
      await screen.setup?.(page, baseURL);
      await page.goto(screen.path, { waitUntil: "domcontentloaded" });
      await screen.afterGoto?.(page, baseURL);

      if (screen.waitForText) {
        await page.getByText(screen.waitForText).first().waitFor({ state: "visible", timeout: 10_000 });
      }

      await page.waitForTimeout(250);
      const fileName = `${screen.slug}.png`;
      const filePath = path.join(viewportDir, fileName);
      await page.screenshot({ path: filePath, fullPage: true });
      console.log(`captured ${viewport.name}/${screen.slug}`);
      manifest.push({
        viewport: viewport.name,
        route: screen.path,
        screen: screen.slug,
        file: path.relative(outputDir, filePath).replaceAll("\\", "/"),
      });

      await context.close();
    }
  }

  await browser.close();
  await writeFile(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(outputDir);
} finally {
  if (serverProcess) {
    stopServer(serverProcess);
  }
}

function buildQuestionnaire({ id, title, prefix, total }) {
  return {
    id,
    title,
    questions: Array.from({ length: total }, (_, index) => {
      const number = index + 1;
      return {
        id: `${prefix}-${number}`,
        stableKey: `${prefix}-${number}`,
        prompt: `Question ${number}`,
        questionType: "multiple_choice",
        position: number,
        options: [
          { id: `${prefix}-${number}-a`, label: `Option ${number}A`, value: "a", position: 1 },
          { id: `${prefix}-${number}-b`, label: `Option ${number}B`, value: "b", position: 2 },
        ],
      };
    }),
  };
}

async function findOpenPort(startPort) {
  for (let port = startPort; port < startPort + 100; port += 1) {
    if (await isPortOpen(port)) {
      return port;
    }
  }

  throw new Error("Could not find an open local port.");
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

async function startServer(port, baseURL) {
  const nextBin = path.join(rootDir, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], {
    cwd: rootDir,
    env: {
      ...process.env,
      E2E_TEST_MODE: "1",
      NEXT_PUBLIC_E2E_TEST_MODE: "1",
    },
    stdio: "pipe",
  });

  let recentOutput = "";
  child.stdout.on("data", (chunk) => {
    recentOutput += chunk.toString();
    recentOutput = recentOutput.slice(-4000);
  });
  child.stderr.on("data", (chunk) => {
    recentOutput += chunk.toString();
    recentOutput = recentOutput.slice(-4000);
  });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next dev server exited early.\n${recentOutput}`);
    }

    try {
      const response = await fetch(baseURL);
      if (response.ok) {
        return child;
      }
    } catch {
      // Keep waiting for the dev server.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  child.kill();
  throw new Error(`Timed out waiting for Next dev server.\n${recentOutput}`);
}

function stopServer(child) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }

  child.kill();
}
