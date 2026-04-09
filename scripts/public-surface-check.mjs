import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = process.cwd();
const selfPath = relative(repoRoot, fileURLToPath(import.meta.url)).replace(/\\/g, "/");

const trackedArtifactChecks = [
  { pattern: /(^|\/)\.firecrawl\//, reason: "tracked Firecrawl artifact" },
  { pattern: /(^|\/)\.claude\/(logs|projects)\//, reason: "tracked Claude runtime artifact" },
  { pattern: /(^|\/)\.codex\//, reason: "tracked Codex runtime artifact" },
  { pattern: /\.har(?:\.gz)?$/, reason: "tracked browser capture" },
  { pattern: /\.trace(?:\.json)?$/, reason: "tracked browser trace" },
  { pattern: /(^|\/)storage-state\.json$/, reason: "tracked browser storage state" },
  { pattern: /(^|\/)cookies\.(txt|json)$/, reason: "tracked browser cookies" },
  { pattern: /\.session\.json$/, reason: "tracked session artifact" },
];

const packArtifactChecks = [
  ...trackedArtifactChecks,
  { pattern: /^(test|tests)\//, reason: "tests included in npm package" },
];

const absolutePathPattern =
  /(?:\/Users\/[^\s"'`<>()]+|\/home\/[^\s"'`<>()]+|[A-Za-z]:\\\\Users\\\\[^\s"'`<>()]+)/;

const secretPattern =
  /(AQ\.[A-Za-z0-9._-]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z\-_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk_(?:live|test|proj)_[A-Za-z0-9]{16,}|xox[baporsc]-[A-Za-z0-9-]{10,}|ya29\.[A-Za-z0-9\-_]+|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;

const binaryExtensions = new Set([
  ".7z",
  ".avif",
  ".bin",
  ".bmp",
  ".class",
  ".db",
  ".dll",
  ".dylib",
  ".eot",
  ".gif",
  ".gz",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".otf",
  ".pdf",
  ".png",
  ".pyc",
  ".so",
  ".sqlite",
  ".tar",
  ".tgz",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);

const findings = [];

function addFinding(scope, filePath, detail) {
  findings.push(`${scope}: ${filePath}: ${detail}`);
}

function truncate(value) {
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}

function listTrackedFiles() {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function readTextFile(absolutePath, relativePath) {
  if (relativePath === selfPath) {
    return null;
  }

  if (binaryExtensions.has(extname(relativePath).toLowerCase())) {
    return null;
  }

  const buffer = readFileSync(absolutePath);
  if (buffer.includes(0)) {
    return null;
  }

  return buffer.toString("utf8");
}

function checkPath(scope, filePath, checks) {
  for (const check of checks) {
    if (check.pattern.test(filePath)) {
      addFinding(scope, filePath, check.reason);
    }
  }
}

function checkText(scope, filePath, text) {
  if (!text) {
    return;
  }

  const absolutePathMatch = text.match(absolutePathPattern);
  if (absolutePathMatch) {
    addFinding(scope, filePath, `absolute local path "${truncate(absolutePathMatch[0])}"`);
  }

  const secretMatch = text.match(secretPattern);
  if (secretMatch) {
    addFinding(scope, filePath, `secret-like value "${truncate(secretMatch[0])}"`);
  }
}

function walkFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const absolutePath = join(dir, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      walkFiles(absolutePath, acc);
    } else if (stats.isFile()) {
      acc.push(absolutePath);
    }
  }
  return acc;
}

function scanTrackedFiles() {
  for (const relativePath of listTrackedFiles()) {
    checkPath("tracked", relativePath, trackedArtifactChecks);
    const absolutePath = join(repoRoot, relativePath);
    const text = readTextFile(absolutePath, relativePath);
    checkText("tracked", relativePath, text);
  }
}

function scanPackedFiles() {
  const tempRoot = mkdtempSync(join(tmpdir(), "public-surface-"));

  try {
    const packJson = execFileSync(
      "npm",
      ["pack", "--json", "--silent", "--pack-destination", tempRoot],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const parsed = JSON.parse(packJson);
    const packResult = Array.isArray(parsed) ? parsed[0] : parsed;
    const tarballPath = join(tempRoot, packResult.filename);

    execFileSync("tar", ["-xzf", tarballPath, "-C", tempRoot], {
      stdio: ["ignore", "ignore", "pipe"],
    });

    const packageRoot = join(tempRoot, "package");
    for (const absolutePath of walkFiles(packageRoot)) {
      const relativePath = relative(packageRoot, absolutePath).replace(/\\/g, "/");
      checkPath("pack", relativePath, packArtifactChecks);
      const text = readTextFile(absolutePath, relativePath);
      checkText("pack", relativePath, text);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addFinding("pack", "package.json", `unable to inspect npm tarball (${message})`);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

scanTrackedFiles();
scanPackedFiles();

if (findings.length > 0) {
  console.error("Public surface check failed:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("Public surface check passed.");
