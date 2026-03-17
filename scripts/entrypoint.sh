#!/bin/sh
# Aplica migraciones y arranca el servidor.
# El script migrate.mjs está copiado al build dentro de /app/scripts/.
set -e

echo "[entrypoint] Aplicando migraciones..."
node /app/scripts/migrate.mjs

echo "[entrypoint] Arrancando servidor..."
exec node /app/build/index.js
