# papermark-cli

Agent-first TypeScript CLI + skill for Papermark dataroom workflows.

This is an unofficial adapter for Papermark Cloud. It currently targets a source-assisted private surface, not a documented public management API.

Current v0.1 scope:

- browser-assisted auth capture
- dataroom list/get
- dataroom folders
- dataroom links/groups/permission groups
- dataroom views/viewers
- dataroom views-count
- dataroom stats
- dataroom export job inspection

## Install

When published:

```bash
npm i -g papermark-cli
papermark --help
```

Local:

```bash
cd platform-adapters/papermark/papermark-cli
npm install
npm link
```

Requirements:

- Node.js 22+
- Chrome installed locally for `papermark auth login`

## Auth

Preferred:

```bash
papermark auth login
papermark auth status --json
papermark doctor --json
```

If the saved team is wrong or you need another workspace, pass `--team-id <id>` on any dataroom command.

Attach to an existing visible Chrome session:

```bash
papermark auth login --cdp-port 9333
```

Advanced non-interactive setup:

```bash
printf '%s' '{"sessionToken":"...","currentTeamId":"..."}' | papermark auth set --stdin
```

Ephemeral env-based auth is also supported:

```bash
export PAPERMARK_SESSION_TOKEN="..."
export PAPERMARK_CURRENT_TEAM_ID="..."
papermark datarooms list --json
```

Saved config lives at `~/.config/papermark/config.json` with `0600` permissions.

## Commands

```bash
papermark doctor --json
papermark datarooms list --json
papermark datarooms list --team-id <id> --json
papermark datarooms get <id> --json
papermark datarooms folders <id> --json
papermark datarooms folders <id> --limit 50 --json
papermark datarooms folders <id> --raw --json
papermark datarooms links <id> --json
papermark datarooms groups <id> --json
papermark datarooms permission-groups <id> --json
papermark datarooms views <id> --json
papermark datarooms views-count <id> --json
papermark datarooms viewers <id> --json
papermark datarooms stats <id> --json
papermark datarooms export-visits <id> --json
```

## Design notes

- This adapter is read-first.
- Dataroom content is effectively folder-first. The top-level documents route may be empty even when the room contains many documents.
- A typical flow is: `datarooms list`, pick the dataroom id you need, then follow with `get`, `folders`, and analytics/access commands.
- `datarooms folders` returns a limited summary by default. Use `--limit` to widen the summary or `--raw` for the full nested tree.
- `doctor` proves auth, team resolution, and dataroom listing. It is a fast sanity check, not a full sweep of every route.
- `export-visits` currently inspects existing export jobs via a GET route. Triggering new export jobs can be added later if the hosted behavior proves stable enough.
- Runtime outputs can contain sensitive dataroom structure, analytics, access-control, and viewer information. Treat command output as private workspace data.

## Contract

See [docs/CONTRACT_V1.md](./docs/CONTRACT_V1.md).

## Release notes

This package is scaffolded for npm trusted publishing from GitHub Actions.

- CI workflow: `.github/workflows/ci.yml`
- publish workflow: `.github/workflows/publish.yml`
- maintainer notes: `papermark-trusted-publishing-notes.md`
