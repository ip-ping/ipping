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
- [ ] Measure form and live results page (table first, SSE with resume)
- [ ] First-run `/setup` and `/admin` (nodes, enrollment tokens, limits, emergency stop, audit)
- [ ] Dockerfile and Docker Hub publishing
- [ ] Full-stack `compose.yaml` (Caddy, frontend, backend, PostgreSQL, one-shot migration)
- [ ] `ipping.sh` installer: direct (systemd, no Docker) and Docker modes, plus update / backup / restore
- [ ] `release-manifest.json`: the tested frontend + backend + node-protocol combination
- [ ] Map overview and estimated network location (needs the backend estimator first)

## License

MIT, see [LICENSE](LICENSE).
