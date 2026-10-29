#!/usr/bin/env bun
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

// MIGRATION_DATABASE_URL debe tener privilegios para CREATE SCHEMA, ALTER TABLE, etc.
// Si no se define, se usa DATABASE_URL como fallback.
const migrationUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;

if (!migrationUrl) {
	console.error('[migrate] ERROR: MIGRATION_DATABASE_URL o DATABASE_URL no están definidas');
	process.exit(1);
}

// search_path fijo: con el por defecto ("$user", public), si existe un esquema con
// el nombre del rol (el dueño se llama librarian), las tablas sin esquema irían ahí.
const client = postgres(migrationUrl, { max: 1, connection: { search_path: 'public' } });
const db = drizzle(client);

console.log('[migrate] Aplicando migraciones desde', migrationsFolder);

try {
	await migrate(db, {
		migrationsFolder
	});
	console.log('[migrate] OK');
} catch (e) {
	console.error('[migrate] ERROR:', e);
	process.exit(1);
} finally {
	await client.end();
}
