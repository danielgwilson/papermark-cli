#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

capture_hits="$(
  find "$root" \
    -type f \
    \( \
      -name '*.har' -o \
      -name '*.har.gz' -o \
      -name '*.trace' -o \
      -name '*.trace.json' -o \
      -name 'storage-state.json' -o \
      -name 'cookies.txt' -o \
      -name 'cookies.json' -o \
      -name '*.session.json' \
    \) \
    -not -path '*/.git/*' \
    -not -path '*/node_modules/*' \
    -not -path '*/dist/*' \
    -not -path '*/coverage/*' \
    -not -path '*/.next/*' \
    -not -path '*/.firecrawl/*' \
    -print 2>/dev/null | sort -u
)"

secret_pattern='((PAPERMARK_SESSION_TOKEN|PAPERMARK_CURRENT_TEAM_ID)=[A-Za-z0-9._~+/=-]{16,}|"(sessionToken|currentTeamId)"[[:space:]]*:[[:space:]]*"[A-Za-z0-9._~+/=-]{16,}"|AQ\.[A-Za-z0-9._-]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z\-_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk_live_[A-Za-z0-9]{16,}|xox[baporsc]-[A-Za-z0-9-]{10,}|ya29\.[A-Za-z0-9\-_]+)'

secret_hits="$(
  rg -n \
    --hidden \
    --glob '!**/.git/**' \
    --glob '!**/node_modules/**' \
    --glob '!**/dist/**' \
    --glob '!**/coverage/**' \
    --glob '!**/.next/**' \
    --glob '!**/.firecrawl/**' \
    --glob '!**/.env' \
    --glob '!**/.env.*' \
    --glob '!**/*.min.*' \
    "$secret_pattern" \
    "$root" 2>/dev/null || true
)"

exit_code=0

if [ -n "$capture_hits" ]; then
  exit_code=1
  printf 'Suspicious capture files:\n%s\n\n' "$capture_hits"
fi

if [ -n "$secret_hits" ]; then
  exit_code=1
  printf 'Secret-like strings:\n%s\n\n' "$secret_hits"
fi

if [ "$exit_code" -eq 0 ]; then
  printf 'No suspicious captures or secret-like strings found in %s\n' "$root"
fi

exit "$exit_code"
