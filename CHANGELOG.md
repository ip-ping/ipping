# Changelog

Progress log for `ipping`, newest first. Each entry is one small, tested step.

## Unreleased

## v0.1.0 (2026-11-04)

First release. Everything below shipped in it. Installs from the release pages work in both modes (tested in clean containers with the published artifacts).

### 2026-11-04: release tags and published installers
- [RELEASING.md](RELEASING.md): semantic versions, `vX.Y.Z` tags (`-rc.N` previews), release order
  (backend, node, application), what each tag publishes, compatibility rules, how to take one back.
- `release.yml` can be started by pushing a tag or by hand (`gh workflow run release.yml -f
  version=0.1.0 -f dry_run=true`); it refuses a tag that does not match `package.json`, publishes only
  from `main`, and a dry run builds and checks everything but publishes nothing. A re-run replaces
  files instead of failing.
- `edge.yml`: every change to the installer on `main` re-uploads `ipping.sh`, `compose.yaml` and the
  `Caddyfile` to a rolling `edge` prerelease (the link-guide approach), after ShellCheck passes. It is a
  prerelease, so `releases/latest/download/ipping.sh` keeps serving the newest tagged release.
- `ipping.sh` starts itself again through sudo when run as a normal user, so the download-and-run
  one-liner in the README works as typed.

### 2026-11-04: installer lint fixes
- Fixed what the newest ShellCheck (the one on CI runners) reports: `A && B || C` chains, and a
  `grep -q` inside a pipeline under `pipefail`, which could end the "wait until the node has
  connected" loop early.

### 2026-11-04: docs
- README shows how to download `ipping.sh` from a release.

### 2026-11-04: release workflow
- `release.yml`: a `v*` tag publishes the versioned image and a GitHub release holding `ipping.sh`,
  `compose.yaml`, `Caddyfile`, the frontend bundle for direct installs, `release-manifest.json` and
  `SHA256SUMS`. The manifest is built from `release.env`, which pins the backend release this
  frontend was tested with. Linted with actionlint; **not run yet**, because no release has been
  tagged (the backend and node need theirs first).

### 2026-11-04: central installer (`ipping.sh`)
- Docker mode and direct mode (systemd, no Docker), `install` / `update` / `start` / `stop` /
  `restart` / `status` / `logs` / `doctor` / `backup` / `restore` / `uninstall`, interactive menu.
- `release-manifest.json` (see `scripts/release-manifest.sh`) pins the frontend, backend and
  node-protocol versions that were tested together; the installer never fetches "latest" parts.
- Direct mode downloads pinned uv, Node.js and Caddy (SHA-256 or SHA-512 as each publisher lists),
  installs the backend from a hash-locked requirements file, runs three unprivileged services under
  hardened units, and creates the `ipping` database and role only if they do not exist.
- Updates take a database backup first and roll back on a failed migration. Release directories are
  named by version and checksum, so an update never overwrites the release that is running.
- Tested in clean containers against the real services, both modes: install, health checks (only
  the proxy publishes ports), setup, a real node enrolling and measuring 1.1.1.1 through the
  installed stack, backup and a restore that really rolls data back, update, uninstall keeping data,
  reinstall reusing it, purge. Direct mode ran with `systemctl` shimmed (containers have no
  systemd), so the generated unit files were executed by the shim, not by systemd.
- Found and fixed while testing: published SHA-512 checksums (Caddy) were compared as SHA-256 and
  the installer correctly refused; a bundle with a 0700 top directory made the frontend unreadable
  to its service user; reinstall after a plain uninstall was blocked and would have generated a
  password that no longer matched the kept database.

### 2026-11-04: CI fix
- `npm run typecheck` now generates Next's route types first (`next typegen`). It had only passed
  locally because a previous build had already created them; CI on a clean checkout caught it.

### 2026-11-04: Docker image and the full-stack compose file
- `Dockerfile` (Next.js standalone, non-root, health check) built once on the build machine and
  shared by both architectures; `sharp` is excluded because the app never uses `next/image`.
- `compose.yaml`: Caddy + frontend + backend + PostgreSQL + one-shot `migrate`, only the proxy
  publishes ports, backend and frontend run read-only with all capabilities dropped.
  `deploy/Caddyfile` flushes `/api/*` immediately (live streams) and does not compress it.
- `docker.yml` publishes `tonyliuzj/ipping` (`latest` + commit SHA) on pushes to `main`, like
  `file-node`; `ci.yml` also builds the image for both architectures.
- Verified with the whole stack in Docker and a real node connecting through the proxy: setup,
  enrollment, approval, live measurement over SSE, emergency stop, and real client addresses in the
  audit log.

### 2026-11-04: first-run setup and administration
- `/setup`: one-time creation of the administrator, gated by the setup token (printed in the backend
  log, or `IPPING_SETUP_TOKEN` from the installer).
- `/admin`: sign-in, then Nodes (approve, edit declared location and mark it verified, rotate key,
  revoke), Enrollment (single-use tokens shown once, with the enroll command), Limits & safety
  (emergency stop, probe budgets, retention, blocked targets) and the audit log.
- Verified in headless Chromium against the real backend and node: wrong setup token refused,
  token -> enroll -> approve, emergency stop blocks new measurements, rotated key cuts the old
  credential off, every action appears in the audit log.

### 2026-11-04: measure form and live results
- Home page: target input (IP, hostname or pasted URL), name-resolution mode, IP version, echo
  count and node selection; the backend's refusal reasons are shown as they are.
- Results page: progress, summary cards (responding nodes, fastest, slowest, packet loss) and the
  per-node table (min / median / avg / max / loss / status) with expandable per-echo detail.
- Live updates over Server-Sent Events: the page reads the full state, then subscribes from the
  sequence number it already has; replayed events are ignored, so reconnects never double-count.
- Node outages and deadlines are labelled as such, never as packet loss. URL input explains that ICMP
  tests the host, not the page. Share toggle (opt-in), cancel, "run again", recent list.
- Verified in headless Chromium against the real backend and the real Rust node.
- Fixed: shadcn's generated CSS pointed `--font-sans` at itself, which fell back to a serif font.

### 2026-11-04: app shell and typed API client
- Next.js 16 (App Router, TypeScript) with shadcn/ui only for components; dark mode follows the system.
- Typed API client: types generated from a pinned copy of the backend's OpenAPI document, session
  and CSRF token handled once (with one automatic retry after a stale token).
- Public Nodes page showing approved nodes and whether each is online.
- CI: lint, typecheck, API-types-match-contract check, production build.
