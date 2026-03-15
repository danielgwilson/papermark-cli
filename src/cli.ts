#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command } from "commander";
import {
  clearConfig,
  getConfigPath,
  redactSessionToken,
  resolveConfig,
  type PapermarkConfig,
} from "./config.js";
import { captureSessionFromBrowser, saveAndValidateSession, validateSession } from "./auth.js";
import { summarizeFolders } from "./folders.js";
import { PapermarkApiClient, PapermarkApiError } from "./papermark-api.js";
import { fail, makeError, ok, printJson } from "./output.js";

type CommonJsonOptions = { json?: boolean };

const AUTH_HELP_TEXT =
  "No Papermark session. Run `papermark auth login`, `papermark auth login --cdp-port <port>`, or `papermark auth set --stdin`.";

function getCliVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version?: unknown };
    return typeof pkg?.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function createClient(config: PapermarkConfig): PapermarkApiClient {
  return new PapermarkApiClient({
    auth: {
      sessionToken: config.sessionToken || "",
      csrfToken: config.csrfToken,
      baseUrl: config.baseUrl,
    },
    userAgent: `papermark-cli/${getCliVersion()}`,
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function createStatusRenderer(label = "papermark") {
  const startedAt = Date.now();
  const spinnerFrames = ["|", "/", "-", "\\"] as const;
  let frame = 0;
  let lastLineLen = 0;
  let currentMsg = "";
  let interval: NodeJS.Timeout | null = null;

  const render = () => {
    const elapsedMs = Date.now() - startedAt;
    const spin = spinnerFrames[frame % spinnerFrames.length];
    frame += 1;
    const seconds = (Math.round(elapsedMs / 100) / 10).toFixed(1);
    const line = `[${label}] ${spin} ${currentMsg || "Working"} (${seconds}s)`;
    const pad = lastLineLen > line.length ? " ".repeat(lastLineLen - line.length) : "";
    lastLineLen = line.length;
    process.stderr.write(`\r${line}${pad}`);
  };

  return {
    start(msg: string) {
      currentMsg = msg;
      if (interval) return;
      render();
      interval = setInterval(render, 120);
    },
    update(msg: string) {
      currentMsg = msg;
      if (!interval) render();
    },
    done(finalMsg?: string) {
      if (interval) clearInterval(interval);
      interval = null;
      if (finalMsg) process.stderr.write(`\r[${label}] ${finalMsg}\n`);
      else process.stderr.write("\n");
    },
  };
}

async function requireConfig({ json }: CommonJsonOptions): Promise<PapermarkConfig> {
  const config = await resolveConfig();
  if (config.sessionToken) return config;

  const error = makeError(null, { code: "AUTH_MISSING", message: AUTH_HELP_TEXT });
  if (json) printJson(fail(error));
  else process.stderr.write(`${AUTH_HELP_TEXT}\n`);
  process.exitCode = 2;
  return {};
}

function requireTeamId(config: PapermarkConfig, explicitTeamId: string | undefined, json?: boolean): string {
  const teamId = explicitTeamId || config.currentTeamId || "";
  if (teamId) return teamId;
  const error = makeError(null, {
    code: "VALIDATION",
    message:
      "No team id available. Capture auth with `papermark auth login`, set `PAPERMARK_CURRENT_TEAM_ID`, or pass `--team-id`.",
  });
  if (json) printJson(fail(error));
  else process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
  return "";
}

function printListHuman(items: Array<{ id: string; name?: string | null; internalName?: string | null; createdAt?: string }>): void {
  for (const item of items) {
    // eslint-disable-next-line no-console
    console.log(`${item.id}\t${item.name || ""}\t${item.internalName || ""}\t${item.createdAt || ""}`);
  }
}

function printSingleHuman(value: unknown): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(value, null, 2));
}

async function parseStdinConfig(): Promise<PapermarkConfig> {
  const raw = (await readStdin()).trim();
  if (!raw) throw new Error("No config JSON provided on stdin");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("Expected a JSON object on stdin");
  const sessionToken = String((parsed as any).sessionToken || "").trim();
  const csrfToken = String((parsed as any).csrfToken || "").trim();
  const currentTeamId = String((parsed as any).currentTeamId || "").trim();
  const baseUrl = String((parsed as any).baseUrl || "").trim();
  if (!sessionToken) throw new Error("Missing sessionToken");
  return {
    sessionToken,
    csrfToken,
    currentTeamId,
    baseUrl,
  };
}

const program = new Command();
program.name("papermark").description("Agent-first CLI for Papermark dataroom workflows").version(getCliVersion());

program
  .command("auth")
  .description("Auth commands")
  .addCommand(
    new Command("show")
      .option("--json", "Print JSON")
      .action(async (opts: CommonJsonOptions) => {
        const config = await resolveConfig();
        const hasSessionToken = Boolean(config.sessionToken);
        const data = {
          hasSessionToken,
          hasCsrfToken: Boolean(config.csrfToken),
          currentTeamId: config.currentTeamId || null,
          source: config.source,
          sessionTokenRedacted: config.sessionToken ? redactSessionToken(config.sessionToken) : null,
          baseUrl: config.baseUrl || null,
          configPath: getConfigPath(),
        };
        if (opts.json) printJson(ok(data));
        else printSingleHuman(data);
      }),
  )
  .addCommand(
    new Command("status")
      .option("--json", "Print JSON")
      .action(async (opts: CommonJsonOptions) => {
        const config = await resolveConfig();
        if (!config.sessionToken) {
          const error = makeError(null, { code: "AUTH_MISSING", message: AUTH_HELP_TEXT });
          if (opts.json) printJson(fail(error, { hasSessionToken: false }));
          else process.stderr.write(`${AUTH_HELP_TEXT}\n`);
          process.exitCode = 2;
          return;
        }

        const validation = await validateSession(config);
        const data = {
          hasSessionToken: true,
          hasCsrfToken: Boolean(config.csrfToken),
          currentTeamId: config.currentTeamId || null,
          source: config.source,
          sessionTokenRedacted: redactSessionToken(config.sessionToken),
          baseUrl: config.baseUrl || null,
          validation,
        };
        if (opts.json) printJson(ok(data));
        else printSingleHuman(data);
      }),
  )
  .addCommand(
    new Command("clear")
      .option("--json", "Print JSON")
      .action(async (opts: CommonJsonOptions) => {
        await clearConfig();
        if (opts.json) printJson(ok({ cleared: true }));
        else process.stderr.write("Cleared saved Papermark auth\n");
      }),
  )
  .addCommand(
    new Command("set")
      .description("Save Papermark auth JSON from stdin")
      .requiredOption("--stdin", "Read auth JSON from stdin")
      .option("--json", "Print JSON")
      .action(async (opts: CommonJsonOptions & { stdin: boolean }) => {
        try {
          const config = await parseStdinConfig();
          const saved = await saveAndValidateSession(config);
          if (opts.json) {
            printJson(
              ok({
                saved: true,
                sessionTokenRedacted: redactSessionToken(saved.config.sessionToken || ""),
                currentTeamId: saved.config.currentTeamId || null,
                validation: saved.validation,
              }),
            );
          } else {
            printSingleHuman({
              saved: true,
              sessionTokenRedacted: redactSessionToken(saved.config.sessionToken || ""),
              currentTeamId: saved.config.currentTeamId || null,
              validation: saved.validation,
            });
          }
        } catch (error: any) {
          const cliError = makeError(error, { code: "VALIDATION", message: error?.message || "Invalid auth JSON" });
          if (opts.json) printJson(fail(cliError));
          else process.stderr.write(`${cliError.message}\n`);
          process.exitCode = 2;
        }
      }),
  )
  .addCommand(
    new Command("login")
      .description("Capture Papermark session from a browser")
      .option("--cdp-port <port>", "Attach to an existing Chrome remote debugging port", (value) => Number(value))
      .option("--cdp-url <url>", "Attach to an existing Chrome CDP endpoint")
      .option("--base-url <url>", "Papermark base URL", "https://app.papermark.com")
      .option("--channel <name>", "Browser channel when launching a new browser", "chrome")
      .option("--headless", "Launch headless", false)
      .option("--timeout-ms <ms>", "Timeout in milliseconds", (value) => Number(value), 180000)
      .option("--json", "Print JSON")
      .action(async (opts: CommonJsonOptions & { cdpPort?: number; cdpUrl?: string; baseUrl: string; channel: string; headless: boolean; timeoutMs: number }) => {
        const status = createStatusRenderer();
        try {
          status.start("Capturing Papermark session");
          const captured = await captureSessionFromBrowser({
            baseUrl: opts.baseUrl,
            channel: opts.channel,
            cdpPort: opts.cdpPort,
            cdpUrl: opts.cdpUrl,
            headless: opts.headless,
            timeoutMs: opts.timeoutMs,
            onStatus: (update) => status.update(update.msg),
          });
          status.update("Saving session");
          const saved = await saveAndValidateSession(captured);
          status.done("Captured Papermark session");
          const data = {
            sessionTokenRedacted: redactSessionToken(saved.config.sessionToken || ""),
            hasCsrfToken: Boolean(saved.config.csrfToken),
            currentTeamId: saved.config.currentTeamId || null,
            validation: saved.validation,
          };
          if (opts.json) printJson(ok(data));
          else printSingleHuman(data);
        } catch (error: any) {
          status.done("Auth capture failed");
          const cliError = makeError(error, { code: "AUTH_INVALID", message: error?.message || "Failed to capture session" });
          if (opts.json) printJson(fail(cliError));
          else process.stderr.write(`${cliError.message}\n`);
          process.exitCode = 1;
        }
      }),
  );

program
  .command("doctor")
  .description("Run health checks")
  .option("--json", "Print JSON")
  .action(async (opts: CommonJsonOptions) => {
    const config = await resolveConfig();
    const checks: Array<{ name: string; ok: boolean; detail?: string }> = [
      { name: "auth.present", ok: Boolean(config.sessionToken) },
      { name: "team.present", ok: Boolean(config.currentTeamId) },
    ];

    if (config.sessionToken && config.currentTeamId) {
      try {
        const client = createClient(config);
        await client.listDatarooms({ teamId: config.currentTeamId, simple: true });
        checks.push({ name: "api.datarooms.list", ok: true });
      } catch (error: any) {
        checks.push({ name: "api.datarooms.list", ok: false, detail: error?.message || "Request failed" });
      }
    }

    const allOk = checks.every((check) => check.ok);
    if (allOk) {
      const payload = ok({ checks });
      if (opts.json) printJson(payload);
      else printSingleHuman(payload);
      return;
    }

    const error = makeError(null, { code: "CHECK_FAILED", message: "One or more checks failed" });
    if (opts.json) printJson(fail(error, { checks }));
    else printSingleHuman({ ok: false, error, checks });
    process.exitCode = 1;
  });

const datarooms = new Command("datarooms").description("Dataroom commands");

datarooms
  .command("list")
  .description("List datarooms for the current or specified team")
  .summary("List datarooms")
  .option("--team-id <id>", "Override team id")
  .option("--search <query>", "Search dataroom names")
  .option("--full", "Request the fuller dataroom payload instead of simple mode", false)
  .option("--json", "Print JSON")
  .action(async (opts: CommonJsonOptions & { teamId?: string; search?: string; full?: boolean }) => {
    try {
      const config = await requireConfig(opts);
      if (!config.sessionToken) return;
      const teamId = requireTeamId(config, opts.teamId, opts.json);
      if (!teamId) return;
      const client = createClient(config);
      const result = await client.listDatarooms({ teamId, search: opts.search, simple: !opts.full });
      if (opts.json) printJson(ok(result));
      else printListHuman(result.datarooms || []);
    } catch (error: any) {
      const cliError = makeError(error);
      if (opts.json) printJson(fail(cliError));
      else process.stderr.write(`${cliError.message}\n`);
      process.exitCode = error instanceof PapermarkApiError && error.status === 401 ? 2 : 1;
    }
  });

function addDataroomReadCommand(
  name: string,
  description: string,
  method: (client: PapermarkApiClient, teamId: string, dataroomId: string) => Promise<unknown>,
) {
  datarooms
    .command(name)
    .description(description)
    .summary(description)
    .argument("<id>", "Dataroom id")
    .option("--team-id <id>", "Override team id")
    .option("--json", "Print JSON")
    .action(async (id: string, opts: CommonJsonOptions & { teamId?: string }) => {
      try {
        const config = await requireConfig(opts);
        if (!config.sessionToken) return;
        const teamId = requireTeamId(config, opts.teamId, opts.json);
        if (!teamId) return;
        const client = createClient(config);
        const result = await method(client, teamId, id);
        if (opts.json) printJson(ok(result));
        else printSingleHuman(result);
      } catch (error: any) {
        const cliError = makeError(error);
        if (opts.json) printJson(fail(cliError));
        else process.stderr.write(`${cliError.message}\n`);
        process.exitCode = error instanceof PapermarkApiError && error.status === 401 ? 2 : 1;
      }
    });
}

addDataroomReadCommand("get", "Get one dataroom's metadata and settings", (client, teamId, id) => client.getDataroom(teamId, id));
addDataroomReadCommand("views", "List dataroom visit events and analytics rows", (client, teamId, id) => client.getDataroomViews(teamId, id));
addDataroomReadCommand("views-count", "Get the summarized view count for a dataroom", (client, teamId, id) => client.getDataroomViewsCount(teamId, id));
addDataroomReadCommand("viewers", "List viewers associated with a dataroom", (client, teamId, id) => client.getDataroomViewers(teamId, id));
addDataroomReadCommand("links", "List share links for a dataroom", (client, teamId, id) => client.getDataroomLinks(teamId, id));
addDataroomReadCommand("groups", "List dataroom groups", (client, teamId, id) => client.getDataroomGroups(teamId, id));
addDataroomReadCommand("permission-groups", "List permission groups for a dataroom", (client, teamId, id) => client.getDataroomPermissionGroups(teamId, id));
addDataroomReadCommand("stats", "Get summary stats for a dataroom", (client, teamId, id) => client.getDataroomStats(teamId, id));
addDataroomReadCommand("export-visits", "Inspect visit export jobs for a dataroom", (client, teamId, id) => client.getDataroomExportVisits(teamId, id));

datarooms
  .command("folders")
  .description("Inspect the dataroom folder tree, summarized by default")
  .summary("Inspect dataroom folders")
  .argument("<id>", "Dataroom id")
  .option("--team-id <id>", "Override team id")
  .option("--raw", "Return the full nested folder payload", false)
  .option("--limit <n>", "Limit summarized root folders", (value) => Number(value), 25)
  .option("--json", "Print JSON")
  .action(async (id: string, opts: CommonJsonOptions & { teamId?: string; raw?: boolean; limit?: number }) => {
    try {
      const config = await requireConfig(opts);
      if (!config.sessionToken) return;
      const teamId = requireTeamId(config, opts.teamId, opts.json);
      if (!teamId) return;
      const client = createClient(config);
      const result = await client.getDataroomFolders(teamId, id);
      const data = opts.raw ? result : summarizeFolders((Array.isArray(result) ? result : []) as any[], opts.limit || 25);
      if (opts.json) printJson(ok(data));
      else printSingleHuman(data);
    } catch (error: any) {
      const cliError = makeError(error);
      if (opts.json) printJson(fail(cliError));
      else process.stderr.write(`${cliError.message}\n`);
      process.exitCode = error instanceof PapermarkApiError && error.status === 401 ? 2 : 1;
    }
  });

program.addCommand(datarooms);

program.parseAsync(process.argv).catch((error) => {
  const cliError = makeError(error);
  printJson(fail(cliError));
  process.exit(1);
});
