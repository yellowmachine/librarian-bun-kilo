#!/usr/bin/env node
// Aplica las migraciones de Drizzle contra la BD de producción.
// Se ejecuta desde el entrypoint.sh antes de arrancar el servidor.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Las migraciones están en /app/drizzle cuando se ejecuta desde el build
const migrationsFolder = path.join(__dirname, '..', 'drizzle');

if (!process.env.DATABASE_URL) {
	console.error('[migrate] ERROR: DATABASE_URL no está definida');
	process.exit(1);
}

const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client);

console.log('[migrate] Aplicando migraciones desde', migrationsFolder);

try {
	await migrate(db, { migrationsFolder });
	console.log('[migrate] OK');
} catch (e) {
	console.error('[migrate] ERROR:', e);
	process.exit(1);
} finally {
	await client.end();
}
