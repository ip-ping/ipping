#!/bin/sh
# Pin the backend API contract this frontend is built against.
#
#   scripts/sync-contracts.sh            re-fetch the ref recorded in contracts/backend-ref.txt
#   scripts/sync-contracts.sh <ref>      fetch another backend tag, branch or commit and record it
#
# The generated types in src/lib/api/schema.d.ts are committed, so building the frontend never
# needs network access to the backend repository.
set -eu
cd "$(dirname "$0")/.."
ref="${1:-$(cat contracts/backend-ref.txt)}"
curl -fsSL "https://raw.githubusercontent.com/ip-ping/ipping-backend/${ref}/contracts/openapi.json" -o contracts/openapi.json
if [ -n "${1:-}" ]; then
  # Resolve branches and tags to the commit actually fetched, so the pin cannot drift.
  sha="$(curl -fsSL "https://api.github.com/repos/ip-ping/ipping-backend/commits/${ref}" | sed -n 's/^  "sha": "\([0-9a-f]*\)".*/\1/p' | head -1)"
  printf '%s\n' "${sha:-$ref}" > contracts/backend-ref.txt
fi
npm run --silent api:types
echo "contract pinned to backend $(cat contracts/backend-ref.txt)"
