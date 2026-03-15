---
name: papermark
description: Use this skill whenever you need to inspect Papermark datarooms via the agent-first `papermark` CLI. Triggers include listing datarooms, inspecting one dataroom, reading folder structures, checking links, groups, permission groups, viewers, views, stats, or export-visits jobs.
---

# Papermark (agent-first CLI)

Use this skill when the task is about Papermark dataroom discovery or analytics.

Default stance:

- Prefer the `papermark` CLI, not manual browser clicking.
- Prefer `--json` for machine use.
- Stay read-first unless the CLI explicitly supports a mutation.
- Model dataroom contents through folder traversal, not just top-level documents.
- If `papermark` is missing from `PATH`, install the published CLI with `npm i -g papermark-cli`. If global npm install is unavailable, install from a local checkout with `npm link`.

## Default workflow

- Sanity check: `papermark doctor --json`
- List rooms: `papermark datarooms list --json`
- If needed, override the saved workspace with `--team-id <id>`
- Take the dataroom id from `datarooms list` and feed it into the follow-up commands
- Inspect one room: `papermark datarooms get <id> --json`
- Read content tree: `papermark datarooms folders <id> --json`
- Use `--limit` for a wider summary and `--raw` only when the full nested folder tree is truly needed
- Inspect access model: `papermark datarooms links <id> --json`, `papermark datarooms groups <id> --json`, `papermark datarooms permission-groups <id> --json`
- Inspect analytics: `papermark datarooms views <id> --json`
- Inspect analytics summary counts: `papermark datarooms views-count <id> --json`
- Inspect viewers: `papermark datarooms viewers <id> --json`
- Inspect room stats: `papermark datarooms stats <id> --json`
- Inspect export jobs: `papermark datarooms export-visits <id> --json`

## Worked example

If the user asks "show me the analytics and folder structure for the investor dataroom":

1. Run `papermark datarooms list --json`
2. Pick the matching dataroom id from `data.datarooms`
3. Run `papermark datarooms folders <id> --json` for the content tree
4. Run `papermark datarooms views <id> --json`, `papermark datarooms viewers <id> --json`, or `papermark datarooms stats <id> --json` depending on the level of analytics detail needed

## Auth

If auth is missing:

- Best interactive path: `papermark auth login`
- If you already have a visible Chrome session with remote debugging: `papermark auth login --cdp-port 9333`
- Saved local config: `printf '%s' '{"sessionToken":"...","currentTeamId":"..."}' | papermark auth set --stdin`
- Best ephemeral path: set `PAPERMARK_SESSION_TOKEN` and `PAPERMARK_CURRENT_TEAM_ID`
- If the stored team id is wrong, pass `--team-id <id>` on the dataroom command instead of recapturing auth

Avoid pasting full session tokens into logs or chat.
Treat dataroom, analytics, links, groups, and viewer output as sensitive workspace data.

## Important constraints

- This adapter targets a private authenticated surface, not a documented public management API.
- Dataroom content is folder-first.
- `export-visits` currently inspects export jobs and does not yet start them.

## Contract essentials

- Prefer `--json` for agent work.
- With `--json`, stdout should contain exactly one JSON object.
- Progress and status belong on stderr.
- Exit codes:
  - `0` success
  - `1` request failure, upstream failure, or failed checks
  - `2` auth/user action required or invalid input
- Common error codes:
  - `AUTH_MISSING`
  - `AUTH_INVALID`
  - `NOT_FOUND`
  - `RATE_LIMITED`
  - `UPSTREAM_5XX`
  - `TIMEOUT`
  - `VALIDATION`
  - `CHECK_FAILED`
