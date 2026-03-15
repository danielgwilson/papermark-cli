# Papermark CLI v1 contract (agent-first)

This document defines stable machine-readable behavior for the Papermark CLI.

## Output rules

- When you pass `--json`, the command prints exactly one JSON object to stdout.
- Progress and status logs go to stderr.
- Auth and read commands prefer JSON output for agent use.

## JSON envelope

Success:

```json
{
  "ok": true,
  "data": {},
  "meta": {}
}
```

Failure:

```json
{
  "ok": false,
  "error": {
    "code": "AUTH_MISSING",
    "message": "No Papermark session. Run `papermark auth login`.",
    "retryable": false,
    "http": { "status": 401 }
  },
  "meta": {}
}
```

## Exit codes

- `0`: success
- `1`: request failure, upstream failure, or failed checks
- `2`: user action required or invalid input

## Error codes

- `AUTH_MISSING`
- `AUTH_INVALID`
- `NOT_FOUND`
- `RATE_LIMITED`
- `UPSTREAM_5XX`
- `TIMEOUT`
- `VALIDATION`
- `CHECK_FAILED`
- `UNKNOWN`

## Coverage boundary

Current v1 coverage:

- browser-assisted auth capture
- `datarooms list`
- `datarooms get`
- `datarooms folders`
- `datarooms links`
- `datarooms groups`
- `datarooms permission-groups`
- `datarooms views`
- `datarooms views-count`
- `datarooms viewers`
- `datarooms stats`
- `datarooms export-visits`
- `doctor`

## Notes

- The CLI depends on an authenticated Papermark browser session or stored session token.
- The CLI currently models dataroom contents via the folder route rather than the top-level documents route.
- `datarooms folders` returns a limited summarized view by default; `--limit` widens it and `--raw` returns the full nested payload.
- `export-visits` currently inspects existing export jobs and does not yet trigger new exports.
