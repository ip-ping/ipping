#!/bin/sh
# Write release-manifest.json: the one combination of frontend, backend and node-protocol versions
# that was tested together. ipping.sh installs exactly this and never fetches "latest" parts.
#
# All inputs are environment variables so the release workflow (and tests) can supply them:
#   STACK_VERSION  FRONTEND_VERSION  FRONTEND_IMAGE  FRONTEND_BUNDLE_URL  FRONTEND_BUNDLE_SHA256
#   BACKEND_VERSION  BACKEND_IMAGE  BACKEND_WHEEL_URL  BACKEND_WHEEL_SHA256
#   BACKEND_LOCK_URL  BACKEND_LOCK_SHA256  BACKEND_SCHEMA_REVISION
#   NODE_PROTOCOLS (space separated, default "1")  NODE_MIN_VERSION
#   RUNTIME_NODE  RUNTIME_CADDY  RUNTIME_UV  RUNTIME_PYTHON (optional; installer has defaults)
set -eu
need() { eval "v=\${$1:-}"; [ -n "$v" ] || { echo "release-manifest.sh: $1 is required" >&2; exit 1; }; }
for var in STACK_VERSION FRONTEND_VERSION FRONTEND_IMAGE FRONTEND_BUNDLE_URL FRONTEND_BUNDLE_SHA256 \
  BACKEND_VERSION BACKEND_IMAGE BACKEND_WHEEL_URL BACKEND_WHEEL_SHA256 BACKEND_LOCK_URL \
  BACKEND_LOCK_SHA256 BACKEND_SCHEMA_REVISION NODE_MIN_VERSION; do need "$var"; done

jq -n \
  --arg stack "$STACK_VERSION" \
  --arg fv "$FRONTEND_VERSION" --arg fimg "$FRONTEND_IMAGE" --arg fu "$FRONTEND_BUNDLE_URL" --arg fs "$FRONTEND_BUNDLE_SHA256" \
  --arg bv "$BACKEND_VERSION" --arg bimg "$BACKEND_IMAGE" --arg bwu "$BACKEND_WHEEL_URL" --arg bws "$BACKEND_WHEEL_SHA256" \
  --arg blu "$BACKEND_LOCK_URL" --arg bls "$BACKEND_LOCK_SHA256" --arg rev "$BACKEND_SCHEMA_REVISION" \
  --arg protocols "${NODE_PROTOCOLS:-1}" --arg nodemin "$NODE_MIN_VERSION" \
  --arg rnode "${RUNTIME_NODE:-}" --arg rcaddy "${RUNTIME_CADDY:-}" --arg ruv "${RUNTIME_UV:-}" --arg rpython "${RUNTIME_PYTHON:-3.12}" \
  '{
     schema: 1,
     stack_version: $stack,
     frontend: { version: $fv, image: $fimg, bundle: { url: $fu, sha256: $fs } },
     backend: {
       version: $bv, image: $bimg,
       wheel: { url: $bwu, sha256: $bws },
       lock: { url: $blu, sha256: $bls },
       schema_revision: $rev
     },
     node: { protocol_versions: ($protocols | split(" ") | map(tonumber)), minimum_version: $nodemin },
     runtime: ({ python: $rpython }
       + (if $rnode == "" then {} else { node: $rnode } end)
       + (if $rcaddy == "" then {} else { caddy: $rcaddy } end)
       + (if $ruv == "" then {} else { uv: $ruv } end))
   }'
