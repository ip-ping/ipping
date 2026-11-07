# Changelog

Progress log for `ipping`, newest first. Each entry is one small, tested step.

## v0.4.0 (2026-11-07)

### feat: an interface of its own, with live SVG maps and graphs
The interface looked like every other shadcn site. It is now a **chart sheet**: warm paper and ink,
one vermilion signal colour, a live world map and a graph for each kind of measurement, all drawn in SVG
with no map or chart library. Four steps, newest first:


### 2026-11-07: a look of its own (4 of 4): the nodes page, the lists and the admin
- **Nodes** is map-first: the fleet's map with a roster beside it (name, place, provider, address
  families, what each node can run). Point at a station or a name and the other lights up; click to pin.
  Four readout numerals under the map: online, countries, providers, IPv6.
- **Recent in this browser** is a framed list with a small bar of how many nodes answered.
- **Admin** under the same design: a service panel of readout numerals, one framed control panel with
  the tabs, and the sign-in and first-run setup in frames. The tab row scrolls sideways instead of
  pushing the page 14 px wider on a phone.
- The HTTP waterfall no longer lets a bar run past its plot while the axis is still gliding to a new
  scale, and the results table's median bar hides on phones so the status column stays in its frame.

### 2026-11-07: a look of its own (3 of 4): live graphs on the measurement page
- The measurement page is now an instrument. At the top, **the reading**: the live map (a station per node
  that sends a pulse out for every reply, a **latency ring** per node that glides as its best round trip
  improves, and the estimated place as a crosshair once the run is over) beside four big readout numerals
  that count up to their values, and a progress rail.
- Then **a graph that fits what was measured**, hand-drawn in SVG with no chart library, sharing one time
  axis, a key, hover tooltips and keyboard focus:
  - ping and TCP: a **range strip**, one row per node, a dot per reply, a bar from fastest to slowest, a
    tick at the median and a cross for every lost probe; rows slide into place, fastest first;
  - HTTP: a **phase waterfall**: DNS, connect, TLS and first byte laid end to end per node, so the slow
    phase stands out;
  - traceroute: a **route ladder**: one rung per router, placed by how long it took to answer, joined by a
    line that steps up where the route gets slow, dashed across silent routers, a ringed destination, with
    a chip row to choose the node.
- **One shared selection.** Point at a station, a chart row or a table row and the same node lights up in
  all three (and in the table's new sparkline column). Clicking a station pins it; for traceroute that
  chooses the route shown.
- Rings only appear where they mean something: ping, TCP and a traceroute that reached the target (an HTTP
  time includes handshakes and server work, so it says nothing about distance), and not when wider than
  8,000 km, which rules almost nothing out.
- The location panel lost its small map (the big one shows the estimate now) and keeps the words, the
  evidence and the limitations. Colours are the validated chart series colours; every graph has a table
  beside it with the same numbers, and the motion stops for people who ask for less.
- Checked with real measurements of every kind at 390, 640, 768, 1024 and 1280 px, light and dark: no
  page or table overflow, no console errors, keyboard focus works.

### 2026-11-07: a look of its own (2 of 4): the live map and the home page
- A **live world map**, drawn by hand as SVG (no map library): a dot-matrix land mass over a graticule,
  one station per node that pulses while the node is connected, a thin scan line sweeping the sheet,
  and a hover/focus tooltip for each station (name, place, what it can run). Stations are real
  buttons, so the map works with the keyboard.
- The map can also draw **latency rings**: a node that measured 12 ms is at most 1,200 km away (light
  in fibre covers about 100 km per millisecond one way, 150 km at the very most), so each node gets a
  geodesic circle of that radius that glides to its new size as samples arrive. The rings are drawn in
  the map component; the measurement page uses them in the next step.
- The home page is the map and the command attached to it, in one frame, under a short headline.
- The mark now draws its rings around its dot (the arcs were off-centre and looked cropped), and the
  scan line's trail is thinner and fainter.

### 2026-11-07: a look of its own (1 of 4): the sheet, the type, the frame
- The interface looked like every shadcn site. It now has an identity: a **chart sheet**. Warm paper
  on a faint dot grid and blue-black ink in light mode, deep water and pale ink in dark mode, and one
  vermilion "signal" colour for what is live or selected. Type is Bricolage Grotesque for text and
  numbers and IBM Plex Mono for labels, axes and units, set in small caps with wide tracking.
- Corners are nearly square; buttons are ink that turns signal on hover; badges are stamps; tabs are a
  ruled underline; tables have ruled mono headers; switches are square. Everything is a **Panel**: a
  hairline box with a ruled caps header and a registration tick in each corner.
- A new mark (a station and the rings of its ping), a header with numbered sections and a live
  "16/16 live" count of connected nodes, and a footer with the one caveat that matters.
- Chart colours are the validated categorical order (blue, orange, aqua, yellow), checked against both
  surfaces with the palette validator; the one warning (orange, aqua and yellow are under 3:1 on
  paper) is covered by visible labels and tables, as the method requires.

## v0.3.2 (2026-11-07)

### fix: dialogs and admin pages that overflowed or hid their buttons
- **Enrollment dialog.** Its token box, the command boxes and the "I have saved it" button stuck out of
  the dialog on the right (the dialog is a one-column grid whose column grew to fit the longest line).
  Every dialog now has a column that can shrink (`minmax(0, 1fr)`) and scrolls if it is taller than the
  screen. The enrollment dialog is wider, its commands wrap inside their boxes and each has a copy
  button, and they are the ones to use now: the installer command first, then `ipping-node enroll`,
  then the Docker settings, with `--allow-insecure` / `--insecure` / `IPPING_NODE_ALLOW_INSECURE=1`
  added when the site is plain HTTP on another host (and a note about what that means).
- **Admin on a phone.** The Nodes, Enrollment and Audit tables were wider than the screen, so the
  Approve, Edit, Rotate key and Revoke buttons were out of sight to the right. On narrow screens each
  node is now a block with its location, version, status, connection and its buttons under its name;
  the token table keeps its Revoke button visible; the audit log folds "who" under the action. The
  public Nodes page keeps its Status column. The four stat cards sit two by two instead of in a tall
  stack (also on a measurement page). The empty-state text now points at the Enrollment tab instead
  of a command.
- **Location panel on a phone.** The "Measurements used" table was wider than the screen and made the
  *whole page* scroll sideways. On narrow screens it shows the node, its round trip and, under the
  name, the distance limit and whether its position is verified. Its note no longer says the model is
  "not yet checked against real targets": it says it was, and where to read how well.
- Checked by opening every dialog (enrollment, edit node, revoke, rotated key, choose nodes) at 1440,
  768 and 390 px and testing that nothing inside leaves the dialog, plus the admin tabs and the nodes
  page in a browser; no console errors.

### 2026-11-07: README brought up to date
- The README now describes what the application does today (the four kinds and what each result page
  shows, the estimated location, sharing, admin), a three-step quick start, the installer's options and
  requirements, what has been tested on fresh Debian 13 machines, a versions and compatibility table
  (this release, the backend it installs, the migration head, which nodes can run what), the
  development commands, and a roadmap that matches the releases (old notes such as "not run yet" and
  v0.1.0 examples are gone).

## v0.3.1 (2026-11-06)

### fix: the web interface on small screens and in the measure form
- **Results table.** The expanded details of a row (the certificate, the hop table, the attempts) sat
  inside the table's sideways scroll, so on a phone or at 1024 px their text ran off the edge and was
  cut. They now stay as wide as the screen however far the table scrolls (a container query,
  `100cqw`) and wrap. The table itself shows fewer columns on narrow screens (region goes under the
  node name, provider and tested IP, and the finer timings, appear as the screen widens; the details
  carry what is dropped), so the status badge is no longer clipped.
- **Measure form.** The "Nodes" control was squeezed into the last column of a four-column grid, its
  label cut to "All online noc" with a greyed-out "Choose" button beside it, and with TCP or HTTP's
  extra fields it wrapped onto a row of its own. The options are now a 12-column grid with the Nodes
  control given half the width, and "Choose" only appears once you pick "Selected".
- Admin labels no longer say "echo requests" for limits that now cover TCP, HTTP and traceroute.
- The installer follows the width of the terminal (a box that does not fit is printed without a
  frame, a long spinner line is cut to one row, a long subtitle goes on its own line); it used to force
  at least 60 columns and wrapped on anything narrower.
- Checked with a browser sweep at 1440, 1024, 768 and 390 px, light and dark, for every kind, the
  admin tabs and the nodes page: no element sticks out of the screen and the console is clean.

## v0.3.0 (2026-11-06)

TCP, HTTP and traceroute measurements in the interface, a guided installer, and the fix for installing
on Debian 13. Installs backend v0.3.0 (database migrations 0004 and 0005 run during install and update).
Nodes of any earlier version keep working for ping and need v0.3.0 for the new kinds.

### 2026-11-06: what the strength labels have meant in practice
- The tooltip on the location panel no longer says the labels are uncalibrated: it quotes what they
  meant when checked against real measurements (see the backend's README), with the caveat that a
  deployment's nodes may be spread differently.

### 2026-11-06: a retried task says so
- A task that was sent again because the backend instance holding it stopped shows "retried" next to
  its status, with an explanation on hover; the admin page can set how many times that may happen.
  Contract re-pinned to backend `501f74b`.

### 2026-11-06: TCP, HTTP and traceroute in the interface
- The measure form has a switch for the kind (Ping, TCP, HTTP, Traceroute). TCP takes `host:port` or a
  port field, HTTP takes a URL with an optional port and a "follow redirects" box, and the form says
  how many of the online nodes can run the chosen kind (older nodes only know ping), instead of
  failing after the click.
- Each kind has its own results. **HTTP**: status, time in DNS / connect / TLS / first byte as a bar,
  server, redirects, and the certificate (issuer, subject, validity with days left, trusted or not;
  a certificate that is not trusted is described and says no request was sent over it). **TCP**: a
  refusal is shown as "refused after N ms" (the machine answered) and not as a connection.
  **Traceroute**: whether the destination was reached, and a hop table where a router inside a
  private network is shown as such, never as an address.
- The overview cards, the "recent" list and "Run again" follow the kind; the location panel appears
  only for ping and TCP, which have round-trip times.
- Admin: the kinds that can be started, the allowed ports, the redirect limit and the hop limit. The
  node lists show what each node can run.
- Contract re-pinned to backend `a7966d3`.
- Checked in a browser against the real thing: a Docker backend on PostgreSQL and a real Linux node,
  measuring 1.1.1.1 and example.com (ping, TCP, HTTP with the real certificate, a followed redirect to
  github.com, `expired.badssl.com` and `wrong.host.badssl.com` reported as untrusted, traceroute),
  no console errors, no horizontal overflow on a phone, light and dark.

### 2026-11-06: a nicer installer
- Guided install: pick Docker or direct, give a domain (validated, with an explanation of what HTTPS
  needs), see a summary, confirm. Nothing changes until you do.
- Progress: every step is a line with a spinner that becomes a check mark and a time; the output of
  the commands behind it goes to `/var/log/ipping-install.log` and appears only when a step fails,
  with the last lines and the log path. Packages are refreshed once, not three times.
- A summary box with the address and the setup token, the next steps, and `access` to show them again.
- `status` (services with running/stopped), `doctor` (grouped, and each failing check says what to
  try), a menu that shows the current state and returns after each action.
- Mistakes are caught early: a port that is already taken (and by which program), an invalid domain or
  `--version`, and arguments are validated before sudo is requested.
- An install that fails part-way can be run again: the "installed" marker is written only once the
  services are up, and the direct install saves its configuration (including the database password)
  as soon as the database exists. Before, a retry hit "already installed" or "role exists but its
  password is unknown".
- Plain output without a terminal (ASCII, no colour, no spinner); `NO_COLOR` honoured.
- Verified through a real terminal emulator (and in pipes) on Debian 13 machines with systemd: Docker
  and direct installs, update from 0.1.0 to 0.2.0, backup and restore, uninstall keeping data,
  reinstall, purge, and the error paths.

### 2026-11-06: fix: installing Docker on Debian 13 broke the release lookup
- The installer *sourced* `/etc/os-release` into its own shell, and that file defines `VERSION`
  (Debian 13: `13 (trixie)`). Whenever Docker had to be installed, `VERSION` became the release to
  download, giving `Could not download .../releases/download/v13 (trixie)/release-manifest.json`.
  The file is now read in a subshell (`os_release KEY`), so it can never touch the script's variables.
- `--version` is validated up front (`v1.2.3`, `latest`, `main`), so any other value is refused with a
  clear message instead of ending up inside a URL.
- Arguments are validated *before* asking for sudo, not after.
- Reproduced on a real Debian 13 machine (systemd, no Docker): v0.2.0 fails with the exact error above;
  with the fix the same machine installs Docker, fetches the right release and the whole stack comes
  up healthy.
- Why it was missed: every earlier test ran with Docker already installed, so the install-Docker branch
  never executed. `tests/installer.sh` now covers the helper (Debian 13 and Ubuntu 24.04 fixtures), the
  version rules and the command line, and runs in CI.

### 2026-11-05: several backend processes
- `compose.yaml`, `.env.example` and `ipping.sh` (`--backend-workers N`) can run more than one backend
  process; they cooperate through PostgreSQL (see the backend README).
- Verified with the whole Docker stack and three workers behind Caddy, driven in a browser: first-run
  setup, enrollment, a live measurement streamed through the proxy, the emergency stop, and rotating a
  node's key (which closes a socket another worker may hold).

## v0.2.0 (2026-11-05)

### 2026-11-04: estimated network location
- A panel under the results table for finished measurements: the likely place, a heuristic evidence
  label (with a tooltip saying what it is not), the closest node's physical distance limit, other
  places that also fit, warnings, the measurements used, and what the method cannot tell you.
  Contradictory evidence and too little evidence are shown as such, with the reason.
- A plain SVG world map (no map library, nothing fetched at runtime): nodes that measured, the likely
  area, alternatives. The outline is generated from Natural Earth by `scripts/build-world-map.mjs`.
- API contract re-pinned to the backend that serves `/location`.
- Verified in headless Chromium against the real backend with ten synthetic nodes: a target in
  Amsterdam is placed in Amsterdam (moderate evidence), every node at ~2 ms gives "a single location
  could not be established" naming the contradiction, and a regional-DNS measurement explains why it
  cannot be estimated. Real-world accuracy is not measured (see the backend README).

### 2026-11-04: verification and hardening
- Run for real under systemd 255 (a container with systemd as PID 1): the published v0.1.0 installers
  bring up PostgreSQL, backend, frontend, Caddy and a node, a measurement completes through the
  sandboxed node, systemd restarts a killed node, all services are enabled for boot, and uninstall
  removes the units.
- Units tightened (clock, hostname, /proc, SUID, IPC, native syscalls only, private umask, no
  capabilities unless needed, a syscall filter on the node). `systemd-analyze security` exposure:
  node 5.8 -> 1.5, backend 3.5, frontend 3.5, Caddy 5.0 (it must bind low ports).
- The `CAP_NET_RAW` fallback was exercised: with unprivileged ping disabled on the host the node's unit
  keeps exactly that one capability and still measures (raw sockets).
- The installers' message for a normal user with no sudo was run (clear error, exit code 1; `--help`
  needs neither).
- Release files get signed build-provenance attestations (`gh attestation verify`), and the
  `compose.yaml` attached to a release pins that release's image tags. Both take effect with the next
  release; attestations cannot be created by a dry run.

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
