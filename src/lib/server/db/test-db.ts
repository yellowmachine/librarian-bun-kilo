/**
 * Factory de base de datos para tests.
 *
 * Cada llamada a createTestDb() crea una instancia PGlite completamente aislada
 * con las migraciones aplicadas y app_user configurado. Los archivos de test pueden
 * correr en paralelo porque cada uno tiene su propia instancia en memoria.
 *
 * Uso:
 *   const tdb = await createTestDb();
 *   await tdb.withRLS('user-1', tx => tx.insert(tags).values(...));
 *   await tdb.cleanup();
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as schema from './schema';

const MIGRATIONS_DIR = resolve(process.cwd(), 'drizzle');

function loadMigrations(): string[] {
	const fs = readFileSync(`${MIGRATIONS_DIR}/meta/_journal.json`, 'utf8');
	const journal = JSON.parse(fs) as { entries: { tag: string }[] };

	const statements: string[] = [];
	for (const entry of journal.entries) {
		const sqlFile = readFileSync(`${MIGRATIONS_DIR}/${entry.tag}.sql`, 'utf8');
		const parts = sqlFile
			.split('--> statement-breakpoint')
			.map((s) => s.trim())
			.filter(Boolean);
		statements.push(...parts);
	}
	return statements;
}

let cachedStatements: string[] | null = null;
function getMigrationStatements(): string[] {
	if (!cachedStatements) cachedStatements = loadMigrations();
	return cachedStatements;
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

export async function createTestDb() {
	const client = new PGlite();

	// Replica scripts/init.sh: el rol de la app y sus privilegios por defecto.
	await client.exec('CREATE ROLE app_user;');
	await client.exec('GRANT USAGE ON SCHEMA public TO app_user;');
	await client.exec(
		'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;'
	);
	await client.exec(
		'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app_user;'
	);

	// Aplicar migraciones — crean las funciones SECURITY DEFINER, las tablas (las de
	// Better Auth también), índices y RLS policies. Sin hardcode.
	for (const stmt of getMigrationStatements()) {
		await client.exec(stmt);
	}

	const db = drizzle(client, { schema });

	async function withRLS<T>(userId: string, callback: (tx: typeof db) => Promise<T>): Promise<T> {
		return db.transaction(async (tx) => {
			await tx.execute(sql`SET LOCAL ROLE app_user`);
			await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
			return callback(tx as unknown as typeof db);
		});
	}

	async function asSuperuser<T>(callback: (tx: typeof db) => Promise<T>): Promise<T> {
		return db.transaction(async (tx) => callback(tx as unknown as typeof db));
	}

	async function cleanup() {
		await client.close();
	}

	return { db, withRLS, asSuperuser, cleanup };
}
