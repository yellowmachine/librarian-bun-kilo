#!/bin/sh
set -e

echo "→ Ejecutando migraciones..."
bun scripts/migrate.ts

echo "→ Iniciando servidor..."
exec bun run build/index.js
