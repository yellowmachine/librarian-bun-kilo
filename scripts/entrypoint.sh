#!/bin/sh
# Aplica migraciones y arranca el servidor.
# El script migrate.mjs está copiado al build dentro de /app/scripts/.
set -e

echo "[entrypoint] Aplicando migraciones..."
bun /app/scripts/migrate.ts

echo "[entrypoint] Arrancando servidor..."
exec bun /app/build/index.js
