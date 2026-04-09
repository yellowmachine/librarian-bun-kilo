#!/bin/sh
set -e

echo "→ Ejecutando migraciones..."
bun run db:migrate

echo "→ Iniciando servidor..."
exec bun run build/index.js
