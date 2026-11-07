# ipping

A self-hostable, distributed network diagnostics service. Type an IP address, hostname or URL and
see how it answers from every node you run, live: **ping**, **TCP connect**, **HTTP request**
(timings and TLS certificate) and **traceroute**, plus an estimate of where an address appears to be.

This repository is the **web interface** (Next.js + shadcn/ui) and the **installer for the whole
central application** (frontend + backend + database + reverse proxy).

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

Current release: **v0.4.0** (application), installing backend **v0.3.0**. Nodes of any earlier version
keep working for ping; they need node **v0.3.0 or newer** for TCP, HTTP and traceroute.

## What you can do with it

| Kind | What one node measures | What the page shows |
|---|---|---|
| **Ping** | ICMP echo requests (1 to 10) | a range strip (a dot per reply, fastest to slowest, the median, lost probes), min / median / avg / max and loss per node |
| **TCP** | opening a connection to a port, then closing it | connect times; a *refused* connection is shown as "refused after N ms" (the machine answered), not as a success |
| **HTTP** | one `GET` (headers only, body never read) | status, a **phase waterfall** of DNS / connect / TLS / first-byte time per node, server, redirects, and the **TLS certificate** (issuer, subject, validity, days left, trusted or not). A certificate that does not verify is described, and no request is sent over it |
| **DNS** | one question to one resolver: a node's own, or Cloudflare, Google or Quad9 | whether the nodes **agree**: stations on the map coloured by the answer they got, every distinct answer with the nodes that got it, response code, TTL and every record. A name that does not exist can be checked. Answers that are private addresses from a node's own resolver are never shown |
| **Traceroute** | the routers between the node and the target (Linux nodes) | whether the destination was reached and a **route ladder** (a rung per router, placed by its round trip) with a hop table; a router inside someone's private network is shown as "a router inside a private network", never as an address |

* **Same IP for every node**, or let each node resolve the name itself (to see CDN / DNS differences).
* **Estimated location** (ping and TCP): where the address appears to be, from the nodes' round
  trips, with the evidence, alternatives and an honest "not enough evidence" or "inconclusive"
  (anycast looks like that). How well it works on real data is in the
  [backend README](https://github.com/ip-ping/ipping-backend#estimated-network-location-experimental).
* **Live results** stream in as each node answers and resume after a dropped connection.
* **Shareable**: a measurement is private to your browser session until you switch on the link.
* **Admin**: approve nodes, enrollment tokens, which kinds are enabled, the allowed TCP/HTTP ports,
  probe budgets, retries, the target blocklist, retention, an emergency stop and an audit log.
* Works on phones and in dark mode.

## The interface

The interface is built like a survey chart, not like a dashboard template: warm paper and ink in light
mode, a deep "night chart" in dark mode, one vermilion signal colour for what is live or selected,
Bricolage Grotesque for text and IBM Plex Mono for labels, axes and units. Everything sits in a ruled
frame with registration ticks in its corners.

* **Live map.** The world as dotted land over a graticule, drawn in SVG (no map library, nothing
  fetched). Every node is a station that pulses while it is connected and sends a ring out for each
  reply it reports. On a measurement each node also gets a **latency ring**: how far its fastest
  round trip could have reached (about 100 km per millisecond, 150 as the physical limit); the target
  is inside all of them, and its estimated location appears as a crosshair when the run ends.
  Rings wider than 8,000 km and HTTP times (which include handshakes and server work) are not drawn,
  because they say nothing about distance.
* **Graphs that fit the measurement**, hand-drawn in SVG on one shared axis: a range strip for ping and
  TCP, a phase waterfall for HTTP, a route ladder for traceroute, a sparkline per row in the table, and
  big readout numerals that count up. They update as samples arrive: dots pop in, rows slide into place,
  the axis glides to its new scale.
* **One selection.** Point at a station, a chart row or a table row and the same node lights up in all
  three; click a station to pin it (for traceroute that picks the route shown).
* **Accessible by design.** Every chart row is focusable and reads out its numbers; tooltips repeat what the
  table already says, and the table is always on the page; colours are the validated categorical order
  and never the only cue (a legend, labels and marks carry the meaning); motion stops when the system
  asks for reduced motion; it works from 390 px up and in dark mode.

## Quick start

1. **Install the central application** on a server (Debian / Ubuntu or anything with Docker):

   ```bash
   curl -fsSL --retry 5 --retry-delay 5 --retry-all-errors https://github.com/ip-ping/ipping/releases/latest/download/ipping.sh -o ipping.sh && chmod +x ipping.sh && bash ipping.sh
   ```

   Open the address it prints, go to `/setup` and create the administrator with the setup token.
2. **Install a node** on each measurement host. In *Admin > Enrollment* create a token, then on the
   host run the node installer (see the [node README](https://github.com/ip-ping/ipping-node)):

   ```bash
   curl -fsSL --retry 5 --retry-delay 5 --retry-all-errors https://github.com/ip-ping/ipping-node/releases/latest/download/ipping-node.sh -o ipping-node.sh && chmod +x ipping-node.sh && bash ipping-node.sh
   ```

   A site served over plain HTTP (no domain yet) needs `--allow-insecure` on nodes of other hosts.
3. **Approve the node** in *Admin > Nodes*, then use the measure form on the home page.

## Install with the installer

Download the installer from the newest release and run it (it asks for sudo itself, and shows a
menu when given no arguments):

```bash
curl -fsSL --retry 5 --retry-delay 5 --retry-all-errors https://github.com/ip-ping/ipping/releases/latest/download/ipping.sh -o ipping.sh && chmod +x ipping.sh && bash ipping.sh
```

Run with no options and it guides you: how to run ipping (Docker or directly), whether you have a
domain for HTTPS, then a summary to confirm before anything is changed. Each step shows progress; the
output of the commands behind it goes to `/var/log/ipping-install.log` and is shown only if a step
fails. At the end a box shows the address and the one-time setup token (`access` shows it again).
On a terminal that cannot show colour or symbols (or with `NO_COLOR=1`), or in a pipe or CI log, the
same information is plain text, and the layout follows the width of the terminal.

Useful commands: `status` (what is running), `doctor` (checks, each with a hint if it fails),
`access`, `logs`, `backup`, `restore FILE`, `update`, `uninstall`.

An install that stops part-way (a typo, a lost connection) can simply be run again: it picks up the
settings it already saved instead of refusing, and nothing is marked "installed" until the
services are actually up.

Or run it non-interactively:

```bash
# Docker: the compose stack below, with generated secrets, health checks and backups.
sudo bash ipping.sh install --mode docker

# Direct: systemd services, no Docker (Debian / Ubuntu). PostgreSQL comes from apt; Python (via
# uv), Node.js and Caddy are downloaded as pinned releases and checked against their publishers'
# checksums. The backend is installed from a hash-locked requirements file.
sudo bash ipping.sh install --mode direct --domain ping.example.com

# A specific release instead of the newest, a different port, several backend processes:
sudo bash ipping.sh install --mode docker --version v0.4.0 --http-port 8088 --backend-workers 4

sudo bash ipping.sh status | logs | doctor | backup | restore FILE | update | uninstall
```

That link always serves the installer of the newest *tagged* release. The unreleased installer from
`main` is at `https://github.com/ip-ping/ipping/releases/download/edge/ipping.sh` (a rolling
prerelease the CI re-uploads on every change). How releases are cut: [RELEASING.md](RELEASING.md).

A release of this repository carries `release-manifest.json`, the one frontend + backend +
node-protocol combination that was tested together; the installer installs exactly that and never
fetches the "latest" of each part. Without `--domain` the site is plain HTTP on port 80 (fine on a
LAN or behind another proxy) and nodes on other hosts need `--allow-insecure`; with a domain Caddy
obtains a certificate. `--version main` is the edge channel (Docker only: images tagged `latest`).

* **Updates** back up the database first, run the migration as an explicit step, keep the previous
  release on disk, and go back to it if the migration fails. Nodes reconnect by themselves within a
  few seconds of the site coming back (node v0.3.1 or newer; before that it took about a minute).
* **Reinstalling** after `uninstall` reuses the kept configuration and database; `--purge` removes
  them. Other databases and PostgreSQL itself are never touched.
* **Scaling:** `--backend-workers 4` (Docker: `IPPING_BACKEND_WORKERS` in `.env`; direct: `IPPING_WORKERS`
  in `/etc/ipping/backend.env`) runs several backend processes. They share PostgreSQL, so any of them
  serves any request or node and a crashed one is cleaned up after; see the backend README.
* **Secrets** (database password, setup token) are generated and stay in a file only root (and the
  service) can read.
* **Requirements:** Docker mode needs only Docker (the installer can install it). Direct mode needs
  systemd and apt (Debian 13, Ubuntu 24.04 tested). Both need outbound HTTPS to GitHub, and ports 80
  and 443 (or the ones you choose) free.

Tested for real on fresh Debian 13 machines with systemd: Docker and direct installs from the
published releases, an update from v0.2.0 (database migrations included), backup and restore,
uninstall and purge, and an older node talking to the newer backend.

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

The `compose.yaml` of a release pins that release's images; the one in the repository follows
`latest`, which is whatever `main` built last. Images are built by GitHub Actions on every push to
`main` (`latest` and the commit SHA, `linux/amd64` + `linux/arm64`) and with a version tag on
releases. The frontend build contains no platform-specific binaries, so it is compiled once and
shipped to both architectures without emulation.

## Versions and compatibility

| This release | Installs backend | Database | Nodes |
|---|---|---|---|
| v0.4.0, v0.3.2 | v0.3.0 | migration `0005` | any node for ping; **v0.3.0+** for TCP, HTTP, traceroute (the measure form says how many online nodes can run the chosen kind) |

Each repository is versioned on its own; the application release names the exact backend release it
was tested with in `release.env` and `release-manifest.json`. Releases carry signed build-provenance
attestations (`gh attestation verify`). Before 1.0 a minor bump may break things, a patch never
should. Details: [RELEASING.md](RELEASING.md) and [CHANGELOG.md](CHANGELOG.md).

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

```bash
npm run lint             # ESLint
npm run typecheck        # next typegen && tsc --noEmit
npm run build            # production build
bash tests/installer.sh  # the installer's own logic: no root, no network, nothing installed
shellcheck -S style ipping.sh tests/installer.sh
```

### Backend contract

The frontend is built against a pinned backend API contract, not whatever the backend happens to
serve today: `contracts/openapi.json` is the backend's OpenAPI document at the commit recorded in
`contracts/backend-ref.txt`, and `src/lib/api/schema.d.ts` is generated from it and committed.

```bash
npm run api:sync                 # re-fetch the pinned contract
scripts/sync-contracts.sh main   # move the pin to a newer backend ref (or a tag), then commit the result
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
- [x] `ipping.sh` installer: direct (systemd, no Docker) and Docker modes, plus update / backup / restore, a guided interface, retry-safety, narrow-terminal layout
- [x] `release-manifest.json`, the release workflow and the rolling `edge` installer ([RELEASING.md](RELEASING.md))
- [x] Tagged releases: v0.1.0, v0.2.0, v0.3.0 (v0.3.1, v0.3.2 and v0.4.0 for the application)
- [x] Estimated network location panel with an SVG world map (no map library; outline from Natural Earth, public domain)
- [x] TCP, HTTP and traceroute in the interface (kind switch, per-kind results, admin settings)
- [x] Responsive results table, measure form, dialogs and admin pages (phones, tablets, dark mode)
- [x] Per-node latency circles on the live map, and live SVG graphs per kind (range strip, phase waterfall, route ladder)
- [x] An interface of its own: chart-sheet design, live fleet map, nodes page with a roster, restyled admin
- [x] Compare DNS answers across nodes (A, AAAA, CNAME, MX, NS, TXT, SOA; the node's own resolver or a public one)
- [ ] Public IPv6 verified end to end (needs a test host with IPv6 internet)

## Credits

The world outline in `src/lib/geo/world-path.ts` is generated from [Natural Earth](https://www.naturalearthdata.com)
110m land (public domain) by `scripts/build-world-map.mjs`. The typefaces, Bricolage Grotesque and
IBM Plex Mono, are open source (SIL Open Font License); `next/font` downloads them at build time and the
application serves them itself, so a visitor's browser never contacts a font host.

## License

MIT, see [LICENSE](LICENSE).
