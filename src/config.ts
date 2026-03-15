import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type PapermarkConfig = {
  sessionToken?: string;
  csrfToken?: string;
  currentTeamId?: string;
  baseUrl?: string;
};

export type ResolvedConfig = PapermarkConfig & {
  source: "env" | "config" | "mixed" | "none";
};

const DEFAULT_BASE_URL = "https://app.papermark.com";

function getConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg && xdg.trim() ? xdg : path.join(os.homedir(), ".config");
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), "papermark", "config.json");
}

export async function readConfig(): Promise<PapermarkConfig> {
  const configPath = getConfigPath();
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? (parsed as PapermarkConfig) : {};
  } catch {
    return {};
  }
}

export async function writeConfig(config: PapermarkConfig): Promise<void> {
  const configPath = getConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  const json = JSON.stringify(config, null, 2);
  await fs.writeFile(configPath, json, { mode: 0o600 });
  try {
    await fs.chmod(configPath, 0o600);
  } catch {
    // ignore
  }
}

export async function clearConfig(): Promise<void> {
  const configPath = getConfigPath();
  try {
    await fs.unlink(configPath);
  } catch {
    // ignore
  }
}

export function redactSessionToken(token: string): string {
  if (!token) return "";
  const clean = String(token).trim();
  if (clean.length <= 12) return `${clean.slice(0, 4)}…`;
  return `${clean.slice(0, 6)}…${clean.slice(-4)}`;
}

function cleanBaseUrl(value: string | undefined): string {
  const raw = (value || "").trim();
  if (!raw) return DEFAULT_BASE_URL;
  return raw.replace(/\/+$/, "");
}

export async function resolveConfig(): Promise<ResolvedConfig> {
  const fileConfig = await readConfig();

  const envSessionToken = process.env.PAPERMARK_SESSION_TOKEN?.trim();
  const envCsrfToken = process.env.PAPERMARK_CSRF_TOKEN?.trim();
  const envTeamId = process.env.PAPERMARK_CURRENT_TEAM_ID?.trim();
  const envBaseUrl = process.env.PAPERMARK_BASE_URL?.trim();

  const resolved: PapermarkConfig = {
    sessionToken: envSessionToken || fileConfig.sessionToken,
    csrfToken: envCsrfToken || fileConfig.csrfToken,
    currentTeamId: envTeamId || fileConfig.currentTeamId,
    baseUrl: cleanBaseUrl(envBaseUrl || fileConfig.baseUrl),
  };

  const fromEnv = Boolean(envSessionToken || envCsrfToken || envTeamId || envBaseUrl);
  const fromConfig = Boolean(
    fileConfig.sessionToken || fileConfig.csrfToken || fileConfig.currentTeamId || fileConfig.baseUrl,
  );

  const source: ResolvedConfig["source"] = fromEnv && fromConfig ? "mixed" : fromEnv ? "env" : fromConfig ? "config" : "none";

  return { ...resolved, source };
}
