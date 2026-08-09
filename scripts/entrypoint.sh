#!/bin/sh
set -e

bun scripts/migrate.ts
exec bun run build/index.js
