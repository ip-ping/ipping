# syntax=docker/dockerfile:1

# Frontend only. The full application (proxy + frontend + backend + database) is compose.yaml.
#
# The build output has no platform-specific binaries (see next.config.ts), so it is produced once
# on the build machine and shipped unchanged to every target architecture: a multi-architecture
# build never runs npm or the Next.js compiler under emulation.
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS deps

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci


FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `public/` may be empty (git does not keep empty directories), so make sure it exists.
RUN mkdir -p public && npm run build


FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/.next/standalone ./

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/nodes').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# This server expects a reverse proxy that sends /api/* to the backend (compose.yaml has one).
CMD ["node", "server.js"]
