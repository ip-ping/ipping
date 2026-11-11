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

Current release: **v0.15.0** (application), installing backend **v0.12.0**. Nodes of any earlier version
keep working for ping; they need node **v0.3.0 or newer** for TCP, HTTP and traceroute, **v0.4.0** for DNS, and
**v0.5.0** to repeat a traceroute in rounds and to check certificates, **v0.6.0** for DNS over HTTPS and QUIC, and **v0.7.0**
for DNS over HTTPS to Quad9 (which needs HTTP/2).

## What you can do with it

| Kind | What one node measures | What the page shows |
|---|---|---|
| **Ping** | ICMP echo requests (1 to 10) | a range strip (a dot per reply, fastest to slowest, the median, lost probes), min / median / avg / max and loss per node |
| **TCP** | opening a connection to a port, then closing it | connect times; a *refused* connection is shown as "refused after N ms" (the machine answered), not as a success |
| **HTTP** | one `GET` (headers only, body never read) | status, a **phase waterfall** of DNS / connect / TLS / first-byte time per node, server, redirects, and the **TLS certificate** (issuer, subject, validity, days left, trusted or not). A certificate that does not verify is described, and no request is sent over it |
| **DNS** | one question to one resolver: a node's own, or Cloudflare, Google or Quad9 | whether the nodes **agree**: stations on the map coloured by the answer they got, every distinct answer with the nodes that got it, response code, TTL and every record. A name that does not exist can be checked. Answers that are private addresses from a node's own resolver are never shown. Cloudflare, Google and Quad9 can also be asked **over HTTPS (DoH)**; a result says so. Quad9 answers DoH only over HTTP/2, which nodes speak from v0.7.0, so older nodes are left out of that question |
| **Certificate** | a TLS handshake with no request after it (any TLS service on an allowed port; 443 unless given) | one card for each **distinct certificate** the nodes were shown: trusted or not (and why not), days left on a timeline with today marked, the names it is valid for, who issued it and how many nodes saw it (a count, not a list of their names). Several cards mean the nodes were not talking to one server, or a certificate is being replaced. Stations on the map are coloured by the certificate they saw. A watch on it alerts when a certificate has under 14 days left, before it fails. It can also be a **QUIC handshake** (the transport of HTTP/3), which names the protocol agreed |
| **Traceroute** | the routers between the node and the target (Linux nodes) | whether the destination was reached and a **route ladder** (a rung per router, placed by its round trip) with a hop table; a router inside someone's private network is shown as "a router inside a private network", never as an address. With **rounds** (like `mtr`, up to 10) every hop shows its loss and best / average / worst time, and tells a router that is merely slow to answer probes aimed at it from loss that really carries on to the destination. With a GeoIP database on the backend, the **networks** the route crosses are listed and the route is drawn on a map; a router whose registered place light could not have reached in the time it answered is left off the map and counted |

* **Who resolves a hostname is a choice.** By default each node resolves the name itself and probes the address it gets, so a CDN or geo-DNS shows its differences; or **one node you pick** resolves it and every node probes that address (the same server measured from everywhere). The measurement says who resolved it. An IP address is the same for every node either way.
* **Estimated location** (ping and TCP): where the address appears to be, from the nodes' round
  trips, with the evidence, alternatives, warnings and an **accuracy percentage** (how often answers like it
  were within 500 km on real targets; thin evidence still gets an answer, and says how thin; nodes that disagree,
  which anycast looks like, are said so). When the nodes resolved a name to different addresses there is one estimate
  per address (the address most nodes measured first, the others one click away), and the map shows rings only
  for the nodes that measured it. How well it works on real data is in the
  [backend README](https://github.com/ip-ping/ipping-backend#estimated-network-location-experimental).
* **IP info.** What the site's IP data sources (the lookup API, `GET /api/v1/ip/{address}`) say about an address, **voted**:
  country, region, city, position, postal code, time zone, AS number and owner, and the network the record covers, **each with how
  sure the vote is** (a percentage), and a list of the nine sources with what each said and whether it agreed. One source with
  something to say is enough. A measurement lists **every address its nodes
  tested** with that information (a name each node resolved for itself can be several), and the form has an **IP info** option
  that looks an address up and measures nothing (empty: your own address; `/?kind=ip` opens it). Who sees it follows the lookup's
  access setting on the admin page (*IP data*): by default it is for API keys and administrators, so an ordinary visitor sees
  neither the list nor an answer (the option says why) until an administrator opens it to everyone.
* **Live results** stream in as each node answers and resume after a dropped connection.
* **Languages.** The interface comes in English, 简体中文, Español, Français, Deutsch, Português, Русский, 日本語 and 한국어. It follows the
  browser's language until the visitor picks one in the header (the browser remembers the choice and it wins from then on). An
  administrator decides in *Admin > Limits & safety > Language* which languages are on, which is the default and whether the browser's
  language is followed (the settings are the backend's `languages_enabled`, `default_language` and `language_auto_detect`; the page
  reads them from `GET /api/v1/config`). The words of the main screens (the header, the home page, the measure form, a measurement's
  headings, numbers, table columns and statuses, the nodes page and the IP info) are translated; long explanations of the
  location estimate and the administration pages are in English, and a message a language has not translated is shown in English. To add
  a language: its code in the backend's `LANGUAGES` (`runtime_settings.py`), in `src/lib/i18n/languages.ts`, and a file next to
  `src/lib/i18n/messages/en.ts`; `npm test` checks that every language translates every message and keeps its `{placeholders}`.
* **Shareable**: a measurement is private to your browser session until you switch on the link.
* **Admin** (at `/admin`: the header has no link to it): approve nodes, enrollment keys (single-use, or **reusable** for many nodes, up to 30 days), revoke a node (it is removed, and there is no key rotation: enroll it again), which kinds are enabled, the allowed TCP/HTTP ports,
  probe budgets, retries, the target blocklist, retention, an emergency stop and an audit log, and the
  **IP data**: a MaxMind account the backend downloads its databases with, an IP lookup API, and nodes that fill in
  their own country, city, provider and AS number.
* Works on phones and in dark mode.

## The interface

The interface is built from **shadcn/ui components only** (`src/components/ui`, added with the shadcn CLI and never edited
by hand; no second component library). Cards, tabs, tables, dialogs, accordions, toggles, badges, selects and the
rest are the stock components with the stock neutral theme and Geist. What is its own is the live data: the world map
and the graphs, drawn in SVG inside Cards (the plan allows exactly that), with a small set of colour tokens for them in
`globals.css`. A lint rule fails the build on a raw `<button>`, `<input>`, `<table>`, `<label>` and the like outside
`src/components/ui`.

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
* **Choose who measures on the map.** Click stations (or shift-drag over a region) on the home page's
  map and only those nodes run the next measurement; a node that cannot run the chosen kind is drawn faint.
* **A second opinion that is checked.** With a GeoIP / ASN database set up on the backend, the location panel
  names the network and says whether the database's place is ruled out by the measurements (a node heard from
  the address faster than light could make the trip) or merely not contradicted. It never changes the estimate.
  The same goes for a **geofeed** (RFC 8805): where the address's own network says its addresses are, from the
  feeds an administrator lists (`ipping.sh geofeed-update --feed https://...`); only those are fetched, only then.
* **Nine IP data sources, and an API for them.** *Admin > IP data* lists MaxMind GeoLite2, DB-IP Lite, IPtoASN, IPdeny,
  ip2region, IPinfo, IPLocate, ipapi.is and IP2Location, each with a **switch (all on until you turn one off)**, its state, what
  it needs and, for the online ones, a place for an **optional key** (written, never shown again). The databases that need no
  account are downloaded and kept current by the backend itself; the online services work without a key at a low daily limit and
  the address that is looked up is sent to them (turn them off, or set `IPPING_IPDATA_OFFLINE=1`, if that is not wanted). A free
  MaxMind GeoLite2 account ID and license key adds MaxMind: the backend downloads the City and ASN databases, keeps them current
  (how often is a setting; "Update now" is a button), and uses them everywhere an address is looked at. They also answer `GET /api/v1/ip/<address>`
  (network, country, region, city, position, time zone, AS number and organisation), whose access (off, anyone, an API key
  or an administrator, administrators only) and rate are settings on the same page. A node's country, region, city,
  position, provider and AS number are **filled in from the address it connects from** unless the node reported
  them or you typed them: in a node's edit dialog the values that came from the data are marked *auto*, a value you type
  stays yours, and clearing a field hands it back. See [IP data](#ip-data-maxmind-and-the-lookup-api).
* **Watches.** In the admin, a check can run on a schedule from every node and alert a webhook or an ntfy topic
  when it goes bad (once) and when it is back (once), with an uptime strip of its recent runs.
* **From a terminal.** An administrator can create API keys (with quotas) and scripts can use them; `ipping-cli`
  runs any kind from a shell and prints the result as text.
* **Anycast shows.** When two nodes got round trips too fast for any single place, the map joins them with a
  dashed line and says how far apart they are against how far their round trips allow.
* **Take it with you.** Export a result as text to paste, a CSV (cells that a spreadsheet could read as a
  formula are defused) or the full JSON, and see how each node moved since the previous run of the same
  measurement (this browser's own).
* **One selection.** Point at a station, a chart row or a table row and the same node lights up in all
  three; click a station to pin it (for traceroute that picks the route shown).
* **Accessible by design.** Every chart row is focusable and reads out its numbers; tooltips repeat what the
  table already says, and the table is always on the page; colours are the validated categorical order
  and never the only cue (a legend, labels and marks carry the meaning); motion stops when the system
  asks for reduced motion; it works from 390 px up and in dark mode.

## Quick start

1. **Install the central application** on a server (Debian / Ubuntu or anything with Docker). The commands use curl's `--retry-all-errors`, which needs curl 7.71 or newer (every supported system has it except the now end-of-life Ubuntu 20.04: drop that option there):

   ```bash
   curl -fsSL --retry 5 --retry-delay 5 --retry-all-errors https://github.com/ip-ping/ipping/releases/latest/download/ipping.sh -o ipping.sh && chmod +x ipping.sh && bash ipping.sh
   ```

   Open the address it prints, go to `/setup` and create the administrator with the setup token.
2. **Install a node** on each measurement host. In *Admin > Enrollment* create a key (reusable if you will add several nodes), then on the
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

Run with no options and it guides you: how to run ipping (Docker or directly), whether another web
server such as nginx (and maybe a CDN such as Cloudflare) sits in front of it, whether you have a
domain for HTTPS, then a summary to confirm before anything is changed. Each step shows progress; the
output of the commands behind it goes to `/var/log/ipping-install.log` and is shown only if a step
fails. At the end a box shows the address and the one-time setup token (`access` shows it again).
On a terminal that cannot show colour or symbols (or with `NO_COLOR=1`), or in a pipe or CI log, the
same information is plain text, and the layout follows the width of the terminal.

Useful commands: `status` (what is running), `doctor` (checks, each with a hint if it fails),
`access`, `logs`, `backup`, `restore FILE`, `update`, `proxy`, `geoip-update` (the free DB-IP Lite databases, with no
account; MaxMind is set up in the admin page instead), `geofeed-update --feed URL`, `uninstall`.

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
sudo bash ipping.sh install --mode docker --version v0.7.0 --http-port 8088 --backend-workers 4

# Behind your own nginx (or Apache, Traefik ...) that holds the certificate; ipping listens on 8080:
sudo bash ipping.sh install --mode docker --behind-proxy --domain ping.example.com --http-port 8080
#   ... and Cloudflare in front of nginx:   add --cloudflare

sudo bash ipping.sh status | logs | doctor | backup | restore FILE | update | proxy | geoip-update | geofeed-update | uninstall
```

That link always serves the installer of the newest *tagged* release. The unreleased installer from
`main` is at `https://github.com/ip-ping/ipping/releases/download/edge/ipping.sh` (a rolling
prerelease the CI re-uploads on every change). How releases are cut: [RELEASING.md](RELEASING.md).

A release of this repository carries `release-manifest.json`, the one frontend + backend +
node-protocol combination that was tested together; the installer installs exactly that and never
fetches the "latest" of each part. Without `--domain` the site is plain HTTP on port 80 (fine on a
LAN or behind another proxy) and nodes on other hosts need `--allow-insecure`; with a domain Caddy
obtains a certificate. `--version main` is the edge channel (Docker only: images tagged `latest`).

### Behind nginx, Cloudflare or another proxy

If you already run a web server that holds the certificate (nginx, Apache, Traefik, Caddy ...), tell the installer: answer
"yes" to *Will another web server or proxy sit in front of ipping?*, or give `--behind-proxy --domain NAME`. ipping then
serves plain HTTP on the port you choose (it does **not** ask for a certificate or redirect to HTTPS, which is what makes a
proxy that talks plain HTTP to it loop with `ERR_TOO_MANY_REDIRECTS`), still uses `https://NAME` for its links and cookies,
and believes the visitor addresses the proxy forwards, but only from the proxy: `--proxy-ip` names where it connects from
(by default this machine and private networks), and anything from anywhere else is ignored. The installer prints the nginx
settings at the end (pass the host, allow WebSockets because nodes connect that way, no buffering because results stream live):

```nginx
map $http_upgrade $connection_upgrade { default upgrade; '' close; }
server {
    listen 443 ssl;
    server_name ping.example.com;
    # ssl_certificate and ssl_certificate_key as for any other site
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
```

* **Cloudflare (or another CDN) in front of nginx:** add `--cloudflare` (or `--client-ip-header NAME` for another service's
  header) so each visitor is counted on their own address (rate limits and the audit log) instead of all being nginx.
  Set Cloudflare's SSL/TLS mode to **Full (strict)**: *Flexible* sends plain HTTP to the origin, which is another way to
  get a redirect loop. Cloudflare's header can be forged by anyone who reaches your proxy without going through Cloudflare,
  so let only Cloudflare's address ranges reach nginx, and only nginx reach ipping's port.
* **Nodes** enroll with `https://ping.example.com`, through the proxy.
* **Already installed?** `sudo bash ipping.sh update`, then `sudo bash ipping.sh proxy` (it asks the same questions; or
  `proxy --behind-proxy --domain NAME [--proxy-ip ADDRESS] [--cloudflare]`; `proxy --no-proxy` puts it back). It changes
  the settings and restarts ipping. Update first: a release from before this cannot be told about a proxy.
* **`ERR_TOO_MANY_REDIRECTS` behind a proxy** usually means ipping was installed with `--domain` alone: its own web
  server then answers plain HTTP with a redirect to HTTPS, and the proxy sends it plain HTTP again. `curl -sI -H "Host: NAME"
  http://IP:PORT/` shows `308 Location: https://...` when that is so; the `proxy` command above fixes it.
* Only the port ipping listens on needs to be free (not 80 and 443): if the proxy is on the same machine it keeps those.
  Nothing listens on 443 in ipping's own stack then, and in Docker mode 443 is not taken.

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
  and 443 (or the ones you choose) free; behind a proxy of your own, only the one ipping listens on.

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

## IP data (nine sources) and the lookup API

**The vote.** Every source that is on is asked for an address and **a majority vote** is taken for each field (country, region,
city, position, postal code, time zone, AS number, organization). A field is answered whenever one source has something for it:
one source of nine with data, the other eight empty, failed or off, still gives that data. The sources are held together (only
those that agree on the country vote on the city; only those that agree on the AS number vote on the organization). Each answered
field carries **how sure it is**, from how many sources voted for it and how reliable each is for that kind of data: those
reliabilities are priors (a country is surer than a city), **not measured on your deployment**, so the percentage is an estimate
of how sure the vote is, not a guarantee. The details and the formula are in the
[backend README](https://github.com/ip-ping/ipping-backend#ip-data-nine-sources-one-vote). The IP info card shows the percentage
beside each field and, under it, the sources: what each said, whether it voted with the winner, or why it did not answer
(turned off, needs setup, not downloaded yet, out of requests, offline mode).

The rest of this section is about MaxMind, one of the nine.

IP data says where an address is and who runs its network. It is optional; without it ipping works as it always did,
and with it the location panel has a second opinion, a traceroute names the networks it crosses, nodes describe
themselves, and `/api/v1/ip` answers.

**Set it up in the admin page** (*Admin > IP data*):

1. Create a free **GeoLite2** account at maxmind.com, and under *Manage license keys* make a key. MaxMind's current
   download service needs the **account ID** (a number) as well as the key.
2. Enter both and press *Save account*. The backend downloads the databases you chose (City for places, ASN for the
   network; Country only if you leave City out) and the page shows each one's build date, size and status. The key is kept
   on the server, is never shown again, and never appears in the audit log, an error or a log line. Setting
   `IPPING_MAXMIND_ACCOUNT_ID` and `IPPING_MAXMIND_LICENSE_KEY` does the same and wins (in `/opt/ipping/.env` for
   Docker, in `/etc/ipping/backend.env` for a direct install; then restart).
3. Leave *Keep them up to date automatically* on. A check first asks MaxMind, for free, whether anything newer exists,
   and downloads only if so (MaxMind allows 30 downloads a day); a failure is tried again in an hour, a refused key in six.
   *Update now* does it at once. A new database is used without a restart, and shows its attribution
   ("This product includes GeoLite2 data created by MaxMind") where results do.

Where the databases are kept: Docker installs have a volume for them; a direct install gets a directory
(`/var/lib/ipping-backend/geoip`) from `ipping.sh install` and `ipping.sh update` (an install from before v0.9.0 gets it
on the first `update`). A file whose name starts with `GeoLite2` is used in preference to any other.

**The lookup API.** `GET /api/v1/ip/<address>` (and `GET /api/v1/ip` for the caller's own address) answers:

```sh
curl -H "Authorization: Bearer $KEY" https://ipping.example.com/api/v1/ip/1.1.1.1
```

On the same page choose who may call it: **off**, **an API key or an administrator** (the default; keys are made in
the *API keys* tab), **anyone**, or **administrators only**, and how many lookups a minute one client address may make
(administrators are not limited). Private and reserved addresses are answered as such, without a database. MaxMind's
license lets you answer single lookups, not give out the databases, and the API does not.

**Nodes fill themselves in.** When a node connects, the fields it has not got (country, region, city, position,
provider, AS number) are filled from the address it connected from:

| Field | What happens |
|---|---|
| empty | filled from the data, and marked *auto* |
| *auto* | follows the data when it is updated, and when you press *Fill from IP data* in the edit dialog |
| reported by the node, or typed by you | **never overwritten**; the edit dialog sends only what you changed |
| cleared by you | handed back: it is filled from the data again |

The data's *place* (country, region, city, position) is used only where it **agrees** with the place the node reported or you
typed: a different country, a typed position more than 300 km away, or a city the gazetteer puts that far away means the data is
not used for the place (the provider and the AS number, which belong to the address, still are), because the location
estimate trusts a node's position and a hosting address is often placed at its provider's headquarters. A record with no city
(a country's centre) is never a position. A position from the databases is a city's, not the node's, so it is never marked
*verified*; that stays your decision.
*Admin > IP data > Node details* turns all of this off. Behind a proxy of your own, the address a node connects from is the
one the proxy reports (see `ipping.sh proxy`).

## From a terminal

An administrator creates an **API key** on the admin page (API keys tab: a name and how many measurements a
minute and a day it may start; the key is shown once and only a hash is kept). With a key, a script needs no
browser: `ipping-cli` is one POSIX shell script that needs only `curl`.

```sh
curl -fsSLO https://github.com/ip-ping/ipping/releases/latest/download/ipping-cli.sh && chmod +x ipping-cli.sh
export IPPING_SERVER=https://ipping.example.com IPPING_API_KEY=ipk_...      # or ~/.config/ipping/{server,key}

./ipping-cli.sh ping 1.1.1.1
./ipping-cli.sh -n 2 tcp example.com:443
./ipping-cli.sh http https://example.com/
./ipping-cli.sh traceroute example.com
./ipping-cli.sh -t MX -r google dns example.com            # who has the new MX record?
./ipping-cli.sh -c DE,NL ping example.com                  # only nodes in Germany and the Netherlands
./ipping-cli.sh -R NODE_ID ping example.com                # that node resolves the name, every node probes what it found
```

It prints a report like `ping` or `traceroute` would (a line per node, the hops of a route, the answers of a
DNS lookup) and exits 0; a refusal from the server (a bad key, a quota) is printed with its reason and exits 2.
The key goes to `curl` on its standard input, never as an argument that a process list would show, a key file
that other users can read is warned about, and an `http://` site gets a warning that the key travels
unencrypted. Without the script, the same thing is one request:
`curl -s -H "Authorization: Bearer $KEY" "$SERVER/api/v1/text?target=example.com&kind=ping"`.
`tests/cli.sh` tests the script against a stand-in server (39 checks, run in CI).

## Versions and compatibility

| This release | Installs backend | Database | Nodes |
|---|---|---|---|
| v0.15.0 | v0.12.0 | migration `0013` | **nine IP data sources and a vote**: the IP info card and the target card give each field a percentage and list every source (what it said, whether it agreed, or why it did not answer); *Admin > IP data* has a switch for each of the nine sources (all on) and an optional key for the online ones; the "no node can run this" alert gives both reasons (the node is older, or its host does not allow it; with node v0.8.1 a node with only `CAP_NET_RAW` offers traceroute); works with nodes of any version |
| v0.14.1 | v0.11.0 | migration `0013` | no gap between the command and the map on the home page (the recent list scrolls inside a card as tall as the command); works with nodes of any version |
| v0.14.0 | v0.11.0 | migration `0013` | a better home page: the fleet's numbers in the title's header, the command with the recent measurements beside it, the map across the whole width; the recent list writes every address in full (it was squeezed to nothing) with when it was run; works with nodes of any version |
| v0.13.0 | v0.11.0 | migration `0013` | languages (nine, followed from the browser, remembered, set by the administrator), a home page with the command first and the fleet and recent measurements beside it, no GitHub link; works with nodes of any version |
| v0.12.0 | v0.10.0 | migration `0013` | the location estimate always shows with an accuracy percentage and says when nodes disagree; the measurement page redesigned (headline numbers beside the target's IP info, the map, the best guess, then the details) with result numbers on the map; a node is shown by its place with its network beneath instead of a name; nodes need no name (called `City, CC - Provider · ASn`); reusable enrollment keys; no key rotation; a revoked node is removed; no Admin link in the header. Nodes: **v0.8.0** is the first that enrolls without a name; older nodes still work and keep the names they send |
| v0.11.0 | v0.9.0 | migration `0012` | as v0.10.0 (IP info for the addresses a measurement tested and as an option of its own; the evidence of a location estimate says where each node is and whose it is; the map in the theme's own colours) |
| v0.10.0 | v0.9.0 | migration `0012` | as v0.9.1 (each node resolves a hostname itself by default, or one node you choose resolves it for the rest; the migration adds which node resolved a measurement) |
| v0.9.1 | v0.8.1 | migration `0011` | as v0.9.0 (a node's place from the IP data is only used where it agrees with the place the node reported or you typed) |
| v0.9.0 | v0.8.0 | migration `0011` | as v0.8.0 (IP data: MaxMind from the admin page, an IP lookup API, nodes filled in from their address; the installer gives a direct install somewhere to keep the databases) |
| v0.8.1 | v0.7.0 | migration `0010` | as v0.8.0 (an interface change only: shadcn/ui components only) |
| v0.8.0 | v0.7.0 | migration `0010` | as v0.7.0 (the installer learns about a proxy of your own and a CDN in front of it) |
| v0.7.0 | v0.7.0 | migration `0010` | as v0.6.0, and **v0.7.0+** for DNS over HTTPS to Quad9 (older nodes are left out of that question) |
| v0.6.1 | v0.6.1 | migration `0010` | as v0.6.0 (a measurement that asks for DNS over HTTPS or QUIC goes only to nodes that have them) |
| v0.6.0 | v0.6.0 | migration `0010` | any node for ping; **v0.3.0+** for TCP, HTTP, traceroute; **v0.4.0+** for DNS; **v0.5.0+** for traceroute in rounds and certificate checks; **v0.6.0+** for DNS over HTTPS and QUIC |
| v0.5.1 | v0.5.1 | migration `0009` | as v0.5.0 |
| v0.5.0 | v0.5.0 | migration `0009` | any node for ping; **v0.3.0+** for TCP, HTTP, traceroute; **v0.4.0+** for DNS; **v0.5.0+** to repeat a traceroute in rounds and to check certificates (an older node traces once; the measure form says how many online nodes can run the chosen kind) |
| v0.4.1, v0.4.0 | v0.4.1 | migration `0008` | any node for ping; **v0.3.0+** for TCP, HTTP, traceroute; **v0.4.0+** for DNS (the measure form says how many online nodes can run the chosen kind) |
| v0.3.2 | v0.3.0 | migration `0005` | any node for ping; **v0.3.0+** for TCP, HTTP, traceroute |

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
npm test                 # unit tests (geometry, answer grouping, series, export)
npm run test:ui          # browser checks against a live stack, see tests/ui/README.md
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
- [x] `ipping.sh` installer: direct (systemd, no Docker) and Docker modes, plus update / backup / restore / geoip-update / geofeed-update, a guided interface, retry-safety, narrow-terminal layout
- [x] `release-manifest.json`, the release workflow and the rolling `edge` installer ([RELEASING.md](RELEASING.md))
- [x] Tagged releases: v0.1.0, v0.2.0, v0.3.0 (v0.3.1, v0.3.2, v0.4.0, v0.4.1, v0.5.0, v0.5.1, v0.6.0, v0.6.1, v0.7.0, v0.8.0, v0.8.1, v0.9.0, v0.9.1, v0.10.0, v0.11.0, v0.12.0, v0.13.0, v0.14.0, v0.14.1 and v0.15.0 for the application)
- [x] Estimated network location panel with an SVG world map (no map library; outline from Natural Earth, public domain)
- [x] TCP, HTTP and traceroute in the interface (kind switch, per-kind results, admin settings)
- [x] Responsive results table, measure form, dialogs and admin pages (phones, tablets, dark mode)
- [x] Per-node latency circles on the live map, and live SVG graphs per kind (range strip, phase waterfall, route ladder)
- [x] An interface built from shadcn/ui components only (stock components and theme), with a live fleet map, a nodes page with a roster and the admin
- [x] Compare DNS answers across nodes (A, AAAA, CNAME, MX, NS, TXT, SOA; the node's own resolver or a public one)
- [x] Traceroute in rounds like `mtr`: loss and spread per hop, real loss told from rate limiting
- [x] QUIC (HTTP/3) as a transport of the certificate check
- [x] Community nodes, first slice: volunteers' nodes marked, left out unless asked for, kept out of location estimates until verified, rate limited, and an audit of their declared place (see the backend README for what it does not do)
- [x] DNS over HTTPS as a choice of the DNS check (Cloudflare and Google)
- [x] Certificate checks: trust, expiry, names and issuer from every node, with a card for each distinct certificate and a watch that alerts before it expires
- [x] Nine IP data sources with a switch each (all on), optional keys for the online ones, and a majority vote with a percentage for every field in the IP info card
- [x] IP data: a MaxMind account in the admin page (databases downloaded and kept current), an IP lookup API with its own settings, and nodes filled in from their address unless typed otherwise
- [x] Path analysis: the networks a route crosses and the route on a map (GeoIP database; places checked against the round trip)
- [x] Every kind over IPv6 with global addresses and the real policy, in a network-namespace lab (node CI); see the node README for what that does and does not prove
- [ ] Over the real public IPv6 internet (needs a host with IPv6 connectivity; neither the development machine nor CI runners have it)

## Credits

The world outline in `src/lib/geo/world-path.ts` is generated from [Natural Earth](https://www.naturalearthdata.com)
110m land (public domain) by `scripts/build-world-map.mjs`. The typefaces, Geist and Geist Mono, are open source (SIL
Open Font License); `next/font` downloads them at build time and the application serves them itself, so a visitor's
browser never contacts a font host.

## License

MIT, see [LICENSE](LICENSE).
