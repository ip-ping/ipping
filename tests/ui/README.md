# UI checks

Checks that need a real browser and a real stack: every page at the widths people use (nothing sticks out of
the window, nothing scrolls sideways, the console is clean), what each kind of measurement shows, choosing
nodes on the map, comparing and exporting, the administration pages and dialogs, and the administrator's
tools end to end (a watch that alerts a webhook once, an API key that works from `ipping-cli` and stops when
revoked), and a traceroute repeated in rounds (loss per hop, the networks, the route on a map) and a certificate check
(one card for each distinct certificate, trust and expiry), DNS over HTTPS (the choice only where it can work) community nodes (left out unless asked for, marked, kept out of estimates, audited), who resolves a name (each node, or one chosen), the location estimate's accuracy (an answer for thin evidence and for nodes that disagree), and IP info (the tested addresses of a measurement and the form's IP info option, which follow the lookup's access setting); all four stop with a note when the backend is older than that. The IP data sources have a check of their own (nine rows that are all alike, MaxMind not apart from the others, the switches, keys and accounts that are written and never read back), and the IP info card is checked for a percentage on every field and the list of sources. The home page has its own layout check (every address in the recent list whole at six widths, the order of the parts). They exist because overflow bugs and dead clicks do not show up in a type check.

The logic that does not need a browser (geometry, answer grouping, series, export) is covered by `npm test`.

## What they need

* a backend with `IPPING_SETUP_TOKEN=e2e-token` (any 0.4 or newer; the release this frontend is pinned to is in
  `release.env`) on PostgreSQL;
* the same backend with `IPPING_IPDATA_OFFLINE=1`, so that nothing is downloaded (and no made-up
  account is tried against a service); the IP data checks use the files in `IPPING_GEOIP_DIR` (any of the nine sources' files);
* this frontend, built with `BACKEND_URL` pointing at that backend, and started (`npx next start -p 13100`);
* the simulated fleet: `pip install websockets` and `python3 scripts/dev-fleet.py` (16 nodes that answer ping, TCP,
  HTTP, traceroute and DNS; names starting `nx-` and `split-` give DNS something to disagree about);
* Chromium for Playwright: `npx playwright install chromium`.

## Running them

```sh
BASE_URL=http://127.0.0.1:13100 npm run test:ui              # all of them
npm run test:ui -- admin map-selection                       # some, by name (the file name without its number)
SHOTS=/tmp/ipping-shots npm run test:ui                      # also keep screenshots
```

`WEBHOOK_HOST` is how the backend reaches the machine the checks run on (default `host.docker.internal`, which
is right for a backend in Docker on a laptop; use `127.0.0.1` when the backend runs on the same host). The
checks create and remove their own watches and API keys and leave the stack as they found it.

The workflow `.github/workflows/ui.yml` does all of this on a runner (manually and on pull requests).
