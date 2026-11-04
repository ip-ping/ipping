#!/bin/sh
# Package the production build as one tarball for direct installs: the Next.js standalone server
# with its static assets and public files. Run after `npm run build`.
#   scripts/make-bundle.sh out/ipping-frontend-v0.1.0.tar.gz
set -eu
out="${1:?usage: make-bundle.sh OUTPUT.tar.gz}"
cd "$(dirname "$0")/.."
[ -f .next/standalone/server.js ] || { echo "run npm run build first" >&2; exit 1; }
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
cp -R .next/standalone/. "$stage/"
mkdir -p "$stage/.next" "$stage/public"
rm -rf "$stage/.next/static"
cp -R .next/static "$stage/.next/static"
[ -d public ] && cp -R public/. "$stage/public/"
chmod 755 "$stage"
mkdir -p "$(dirname "$out")"
# COPYFILE_DISABLE keeps macOS from adding extended-attribute headers when run on a Mac.
COPYFILE_DISABLE=1 tar -czf "$out" -C "$stage" .
echo "wrote $out ($(du -h "$out" | cut -f1))"
