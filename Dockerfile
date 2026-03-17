# ─── Stage 1: deps ────────────────────────────────────────────────────────────
# Instala solo las dependencias de producción + las de build.
# Usamos la imagen oficial de Bun para respetar el lockfile.
FROM oven/bun:1 AS deps
WORKDIR /app

COPY package.json bun.lock ./
# Instalar todas las deps (necesitamos las devDeps para el build)
RUN bun install --frozen-lockfile

# ─── Stage 2: build ───────────────────────────────────────────────────────────
FROM oven/bun:1 AS build
WORKDIR /app

# Copiar deps instaladas del stage anterior
COPY --from=deps /app/node_modules ./node_modules

# Copiar todo el código fuente
COPY . .

# Variables de entorno mínimas necesarias para que vite build no falle.
# Los valores reales se inyectan en runtime via Coolify.
ENV NODE_ENV=production
ENV ORIGIN=https://placeholder.local
ENV BETTER_AUTH_SECRET=build-placeholder
ENV DATABASE_URL=postgres://placeholder

# Build SvelteKit → genera /app/build
RUN bun run build

# ─── Stage 3: prod ────────────────────────────────────────────────────────────
# Imagen final mínima: solo Node (el output de adapter-node es JS puro,
# no necesita Bun en runtime).
FROM node:22-alpine AS prod
WORKDIR /app

ENV NODE_ENV=production

# Output del build, migraciones SQL, scripts y entrypoint
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
COPY --from=build /app/drizzle ./drizzle
COPY scripts/entrypoint.sh ./entrypoint.sh
COPY scripts/migrate.mjs ./scripts/migrate.mjs

# Deps de runtime
COPY --from=deps /app/node_modules ./node_modules

RUN chmod +x entrypoint.sh

# Healthcheck: Coolify no redirige tráfico hasta que este pase.
# Permite que las migraciones terminen antes de que el contenedor
# se marque como "ready".
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

EXPOSE 3000

CMD ["sh", "entrypoint.sh"]
