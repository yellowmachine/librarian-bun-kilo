/**
 * Factory de base de datos para tests.
 *
 * Cada llamada a createTestDb() crea una instancia PGlite completamente aislada
 * con la migración aplicada y scholio_app configurado. Los archivos de test pueden
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

	// Replica lo que hace init.sh de scholio para el schema librarian:
	// rol de aplicación, schema, privilegios y funciones SECURITY DEFINER.
	await client.exec('CREATE SCHEMA IF NOT EXISTS librarian;');
	await client.exec('CREATE ROLE scholio_app;');
	await client.exec('GRANT USAGE ON SCHEMA public TO scholio_app;');
	await client.exec('GRANT USAGE ON SCHEMA librarian TO scholio_app;');
	await client.exec(
		'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO scholio_app;'
	);
	await client.exec(
		'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO scholio_app;'
	);
	await client.exec(
		'ALTER DEFAULT PRIVILEGES IN SCHEMA librarian GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO scholio_app;'
	);
	await client.exec(
		'ALTER DEFAULT PRIVILEGES IN SCHEMA librarian GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO scholio_app;'
	);

	// Tabla public.user (gestionada por better-auth, no por migraciones Drizzle)
	await client.exec(`
		CREATE TABLE IF NOT EXISTS public."user" (
			id text PRIMARY KEY,
			name text NOT NULL,
			email text NOT NULL UNIQUE,
			email_verified boolean NOT NULL DEFAULT false,
			image text,
			created_at timestamp NOT NULL DEFAULT now(),
			updated_at timestamp NOT NULL DEFAULT now()
		);
	`);

	// Aplicar migraciones — crean las funciones SECURITY DEFINER (is_group_member,
	// is_group_admin), las tablas, índices y RLS policies. Sin hardcode.
	for (const stmt of getMigrationStatements()) {
		await client.exec(stmt);
	}

	const db = drizzle(client, { schema });

	async function withRLS<T>(userId: string, callback: (tx: typeof db) => Promise<T>): Promise<T> {
		return db.transaction(async (tx) => {
			await tx.execute(sql`SET LOCAL ROLE scholio_app`);
			await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
			await tx.execute(sql`SET LOCAL search_path = librarian, public`);
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
