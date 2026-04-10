# ─── Stage 1: deps ────────────────────────────────────────────────────────────
FROM oven/bun:1 AS deps
WORKDIR /app

RUN apt-get update -qq && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ─── Stage 2: prod-deps ───────────────────────────────────────────────────────
FROM oven/bun:1 AS prod-deps
WORKDIR /app

RUN apt-get update -qq && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ─── Stage 3: build ───────────────────────────────────────────────────────────
FROM oven/bun:1 AS build
WORKDIR /app

ARG PUBLIC_SENTRY_DSN=""

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV ORIGIN=https://placeholder.local
ENV BETTER_AUTH_SECRET=build-placeholder
ENV DATABASE_URL=postgres://placeholder
ENV PUBLIC_SENTRY_DSN=${PUBLIC_SENTRY_DSN}

RUN bun run build

# ─── Stage 4: prod ────────────────────────────────────────────────────────────
FROM oven/bun:1 AS prod
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
COPY --from=build /app/drizzle ./drizzle
COPY scripts/entrypoint.sh ./entrypoint.sh
COPY scripts/migrate.ts ./scripts/migrate.ts

COPY --from=prod-deps /app/node_modules ./node_modules

RUN chmod +x entrypoint.sh

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

EXPOSE 3000

CMD ["sh", "entrypoint.sh"]
