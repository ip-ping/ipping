# ipping

A self-hostable, distributed network diagnostics service: type an IP address, hostname or URL and
see how it answers from every node, live.

This repository is the **web interface** (Next.js + shadcn/ui) and, as it matures, the
**installer for the whole central application** (frontend + backend + database + reverse proxy).

| Repository | Role |
|---|---|
| **`ipping`** (this one) | Next.js frontend; installs the complete central application |
| [`ipping-backend`](https://github.com/ip-ping/ipping-backend) | FastAPI service: REST + live results for browsers, WebSocket for nodes |
| [`ipping-node`](https://github.com/ip-ping/ipping-node) | Rust measurement node, installed separately on every measurement host |

```text
browser --HTTPS--> Caddy --/--------> Next.js (this repo)
                         \--/api/*--> FastAPI backend --> PostgreSQL
                                          ^
                      nodes connect out over WebSocket, no inbound ports
```

## Install with the installer

```bash
# Docker: the compose stack below, with generated secrets, health checks and backups.
sudo bash ipping.sh install --mode docker --version v0.1.0

# Direct: systemd services, no Docker (Debian / Ubuntu). PostgreSQL comes from apt; Python (via
# uv), Node.js and Caddy are downloaded as pinned releases and checked against their publishers'
# checksums. The backend is installed from a hash-locked requirements file.
sudo bash ipping.sh install --mode direct --version v0.1.0 --domain ping.example.com

sudo bash ipping.sh status | logs | doctor | backup | restore FILE | update | uninstall
```

A release of this repository carries `release-manifest.json`, the one frontend + backend +
node-protocol combination that was tested together; the installer installs exactly that and never
fetches the "latest" of each part. Without `--domain` the site is plain HTTP on port 80 (fine on a
LAN or behind another proxy) and nodes on other hosts need `--allow-insecure`; with a domain Caddy
obtains a certificate. `--version main` is the edge channel (Docker only: images tagged `latest`).

* **Updates** back up the database first, run the migration as an explicit step, keep the previous
  release on disk, and go back to it if the migration fails.
* **Reinstalling** after `uninstall` reuses the kept configuration and database; `--purge` removes
  them. Other databases and PostgreSQL itself are never touched.
* **Secrets** (database password, setup token) are generated and stay in a file only root (and the
  service) can read.

## Run the whole application with Docker

```bash
cp .env.example .env      # set POSTGRES_PASSWORD (and IPPING_SITE_ADDRESS for a domain)
docker compose up -d
docker compose logs backend | grep -i "setup token"    # unless you set IPPING_SETUP_TOKEN
```

Then open the site, go to `/setup`, and create the administrator. `compose.yaml` runs

| Service | What it is |
|---|---|
| `proxy` | Caddy: the only published ports (80/443); automatic TLS when `IPPING_SITE_ADDRESS` is a domain; sends `/api/*` (including the live-result stream and the node WebSockets) to the backend, everything else to the frontend |
| `frontend` | this repository's image (`tonyliuzj/ipping`) |
| `backend` | `tonyliuzj/ipping-backend`; waits for the migration, runs read-only with no capabilities |
| `migrate` | one-shot schema upgrade; the backend never changes the schema itself |
| `postgres` | PostgreSQL 16 with a named volume; never published |

Images are built by GitHub Actions on every push to `main` (`latest` and the commit SHA,
`linux/amd64` + `linux/arm64`). The frontend build contains no platform-specific binaries, so it
is compiled once and shipped to both architectures without emulation.

## Run it for development

```bash
# 1. backend (see its README): http://127.0.0.1:8000
# 2. this frontend
npm install
npm run dev              # http://localhost:3000, /api/* is proxied to BACKEND_URL
```

`BACKEND_URL` (default `http://127.0.0.1:8000`) is read when the app is built. In production a
reverse proxy sends `/api/*` straight to the backend, so the frontend always talks to its own
origin with relative `/api/v1/...` paths and no deployment hostname is baked into the build.

### Backend contract

The frontend is built against a pinned backend API contract, not whatever the backend happens to
serve today: `contracts/openapi.json` is the backend's OpenAPI document at the commit recorded in
`contracts/backend-ref.txt`, and `src/lib/api/schema.d.ts` is generated from it and committed.

```bash
npm run api:sync                 # re-fetch the pinned contract
scripts/sync-contracts.sh main   # move the pin to a newer backend ref, then commit the result
npm run api:types                # regenerate types from contracts/openapi.json
```

CI fails if the committed types do not match the pinned contract.

## Roadmap

Small steps, each one committed and logged in [CHANGELOG.md](CHANGELOG.md).

- [x] App shell, theme, typed API client with CSRF handling, public Nodes page
- [x] Measure form and live results page (table first, SSE with resume)
- [x] First-run `/setup` and `/admin` (nodes, enrollment tokens, limits, emergency stop, audit)
- [x] Dockerfile and Docker Hub publishing
- [x] Full-stack `compose.yaml` (Caddy, frontend, backend, PostgreSQL, one-shot migration)
- [x] `ipping.sh` installer: direct (systemd, no Docker) and Docker modes, plus update / backup / restore (tested in clean containers, see CHANGELOG)
- [ ] `release-manifest.json`: the tested frontend + backend + node-protocol combination
- [ ] Map overview and estimated network location (needs the backend estimator first)

## License

MIT, see [LICENSE](LICENSE).
