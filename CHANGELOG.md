# Changelog

Progress log for `ipping`, newest first. Each entry is one small, tested step.

## Unreleased

### 2026-11-04: app shell and typed API client
- Next.js 16 (App Router, TypeScript) with shadcn/ui only for components; dark mode follows the system.
- Typed API client: types generated from a pinned copy of the backend's OpenAPI document, session
  and CSRF token handled once (with one automatic retry after a stale token).
- Public Nodes page showing approved nodes and whether each is online.
- CI: lint, typecheck, API-types-match-contract check, production build.
