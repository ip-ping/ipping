<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## The interface is shadcn/ui only

The owner's rule, from the plan: **Next.js with shadcn/ui only, no second component library.**

- Every control, container and table comes from `src/components/ui` (Card, Table, Tabs, Dialog, Accordion, Toggle, Badge,
  Button, Input, Select, Switch, Checkbox, Label, Alert, Progress, Skeleton, Tooltip, ...). Add one with
  `npx shadcn@latest add <name>`; to restore one, `npx shadcn@latest add -o <name>`. **Never edit a file in
  `src/components/ui`** (no custom radius, fonts, colours or variants) and never rebuild a shadcn component by hand
  from `div`s and `span`s. ESLint fails on a raw `<button>`, `<input>`, `<select>`, `<textarea>`, `<label>`, `<table>`,
  `<details>` and similar outside that folder.
- The theme is the stock one in `src/app/globals.css` (neutral, Geist). The only additions are the colour tokens the live
  map and graphs need (`--signal`, `--viz-*`, `--land`, ...). Do not give the interface "its own look".
- Custom drawing is allowed where shadcn has no component: the SVG map and graphs in `src/components/viz`, inside a Card.

