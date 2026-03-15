import { writeConfig, type PapermarkConfig } from "./config.js";
import { PapermarkApiClient } from "./papermark-api.js";

export type AuthValidation = {
  ok: boolean;
  reason?: string;
  sample?: {
    dataroomCount: number;
  };
};

export type StatusUpdate = {
  msg: string;
  elapsedMs: number;
};

export async function validateSession(config: PapermarkConfig): Promise<AuthValidation> {
  if (!config.sessionToken) return { ok: false, reason: "Missing session token" };
  if (!config.currentTeamId) return { ok: true, reason: "Missing team id; auth captured but team-scoped validation skipped" };

  try {
    const client = new PapermarkApiClient({
      auth: {
        sessionToken: config.sessionToken,
        csrfToken: config.csrfToken,
        baseUrl: config.baseUrl,
      },
    });
    const result = await client.listDatarooms({ teamId: config.currentTeamId, simple: true });
    return {
      ok: true,
      sample: {
        dataroomCount: Array.isArray(result.datarooms) ? result.datarooms.length : 0,
      },
    };
  } catch (error: any) {
    return { ok: false, reason: error?.message || "Validation failed" };
  }
}

export async function saveAndValidateSession(config: PapermarkConfig): Promise<{ config: PapermarkConfig; validation: AuthValidation }> {
  await writeConfig(config);
  const validation = await validateSession(config);
  return { config, validation };
}

export async function captureSessionFromBrowser({
  baseUrl = "https://app.papermark.com",
  timeoutMs = 180_000,
  channel = "chrome",
  headless = false,
  cdpPort,
  cdpUrl,
  onStatus,
}: {
  baseUrl?: string;
  timeoutMs?: number;
  channel?: string;
  headless?: boolean;
  cdpPort?: number;
  cdpUrl?: string;
  onStatus?: (s: StatusUpdate) => void;
}): Promise<PapermarkConfig> {
  let playwright: any;
  try {
    playwright = await import("playwright-core");
  } catch {
    throw new Error("Missing dependency: playwright-core");
  }

  const { chromium } = playwright;
  const startedAt = Date.now();
  const status = (msg: string) => {
    if (typeof onStatus === "function") onStatus({ msg, elapsedMs: Date.now() - startedAt });
  };

  const attachUrl = cdpUrl || (cdpPort ? `http://127.0.0.1:${cdpPort}` : "");
  const attached = Boolean(attachUrl);

  let browser: any;
  if (attached) {
    status(`Connecting to existing Chrome via CDP (${attachUrl})`);
    browser = await chromium.connectOverCDP(attachUrl);
  } else {
    status(`Launching browser (${channel}${headless ? ", headless" : ""})`);
    browser = await chromium.launch({ headless, channel });
  }

  try {
    const context = attached ? browser.contexts()[0] : await browser.newContext();
    if (!context) throw new Error("No browser context available");

    let page = findPapermarkPage(browser, baseUrl);
    if (!page) {
      status("Opening Papermark dashboard");
      page = await context.newPage();
      await page.goto(`${stripTrailingSlash(baseUrl)}/dashboard`, { waitUntil: "domcontentloaded" });
    }

    const started = Date.now();
    status("Waiting for logged-in Papermark session");

    while (Date.now() - started < timeoutMs) {
      const captured = await readPapermarkSession(context, page, baseUrl);
      if (captured.sessionToken && captured.currentTeamId) {
        status("Captured Papermark session");
        return captured;
      }
      await page.waitForTimeout(300);
    }

    throw new Error(
      "Timed out waiting for Papermark session. Finish login in the opened browser window, or attach to an existing logged-in Chrome with `--cdp-port`.",
    );
  } finally {
    if (!attached) {
      status("Closing browser");
      await browser.close();
    }
  }
}

function findPapermarkPage(browser: any, baseUrl: string): any | null {
  const host = new URL(stripTrailingSlash(baseUrl)).host;
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      try {
        const url = page.url();
        if (url.includes(host)) return page;
      } catch {
        // ignore
      }
    }
  }
  return null;
}

async function readPapermarkSession(context: any, page: any, baseUrl: string): Promise<PapermarkConfig> {
  const cookies = await context.cookies(stripTrailingSlash(baseUrl));
  const sessionCookie = cookies.find((cookie: any) =>
    cookie.name === "__Secure-next-auth.session-token" || cookie.name === "next-auth.session-token",
  );
  const csrfCookie = cookies.find((cookie: any) =>
    cookie.name === "__Host-next-auth.csrf-token" || cookie.name === "next-auth.csrf-token",
  );

  let currentTeamId = "";
  try {
    const url = page.url();
    if (url.startsWith(stripTrailingSlash(baseUrl))) {
      currentTeamId =
        ((await page.evaluate(() => localStorage.getItem("currentTeamId"))) as string | null | undefined)?.trim() || "";
    }
  } catch {
    // ignore
  }

  return {
    sessionToken: sessionCookie?.value || "",
    csrfToken: csrfCookie?.value || "",
    currentTeamId,
    baseUrl: stripTrailingSlash(baseUrl),
  };
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
