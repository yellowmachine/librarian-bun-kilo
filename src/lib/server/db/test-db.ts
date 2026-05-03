/**
 * Factory de base de datos para tests.
 *
 * Cada llamada a createTestDb() crea una instancia PGlite completamente aislada
 * con la migración aplicada y scholio_app configurado. Los archivos de test pueden
 * correr en paralelo porque cada uno tiene su propia instancia en memoria.
 *
 * Uso:
 *   const { db, withRLS, cleanup } = await createTestDb();
 *   await withRLS('user-1', tx => tx.insert(tags).values(...));
 *   await cleanup();
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as schema from './schema';

// Ruta a las migraciones relativa a la raíz del proyecto
const MIGRATIONS_DIR = resolve(process.cwd(), 'drizzle');

function loadMigrations(): string[] {
	// Leer todos los .sql en orden y dividirlos por statement-breakpoint
	const fs = readFileSync(`${MIGRATIONS_DIR}/meta/_journal.json`, 'utf8');
	const journal = JSON.parse(fs) as { entries: { tag: string }[] };

	const statements: string[] = [];
	for (const entry of journal.entries) {
		const sql = readFileSync(`${MIGRATIONS_DIR}/${entry.tag}.sql`, 'utf8');
		const parts = sql
			.split('--> statement-breakpoint')
			.map((s) => s.trim())
			.filter(Boolean);
		statements.push(...parts);
	}
	return statements;
}

// Cache de statements para no releer en cada test
let cachedStatements: string[] | null = null;
function getMigrationStatements(): string[] {
	if (!cachedStatements) cachedStatements = loadMigrations();
	return cachedStatements;
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

export async function createTestDb() {
	const client = new PGlite();

	// Equivalente a init.sql: crear schemas, scholio_app y default privileges
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

	// Tablas de better-auth en public (FK target de las migraciones)
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

	// Aplicar migraciones
	for (const stmt of getMigrationStatements()) {
		await client.exec(stmt);
	}

	// PGlite detecta recursión infinita en las políticas de group_members que
	// se auto-referencian (SELECT 1 FROM group_members dentro de la política
	// de group_members). PostgreSQL real lo resuelve internamente; PGlite no.
	// Solución: funciones SECURITY DEFINER que bypasean RLS al hacer el lookup,
	// y reemplazar las políticas recursivas por versiones que usan estas funciones.
	await client.exec(`
		CREATE OR REPLACE FUNCTION is_group_member(p_group_id text, p_user_id text)
		RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS
		$$ SELECT EXISTS (SELECT 1 FROM librarian.group_members WHERE group_id = p_group_id AND user_id = p_user_id) $$;

		CREATE OR REPLACE FUNCTION is_group_admin(p_group_id text, p_user_id text)
		RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS
		$$ SELECT EXISTS (SELECT 1 FROM librarian.group_members WHERE group_id = p_group_id AND user_id = p_user_id AND role IN ('owner', 'admin')) $$;
	`);

	// Reemplazar políticas recursivas en group_members
	await client.exec(`
		DROP POLICY IF EXISTS "group_members_select" ON librarian.group_members;
		DROP POLICY IF EXISTS "group_members_insert_self" ON librarian.group_members;
		DROP POLICY IF EXISTS "group_members_delete" ON librarian.group_members;

		CREATE POLICY "group_members_select" ON librarian.group_members FOR SELECT TO scholio_app
		USING (user_id = current_setting('app.current_user_id', true)
			OR is_group_member(group_id, current_setting('app.current_user_id', true)));

		CREATE POLICY "group_members_insert" ON librarian.group_members FOR INSERT TO scholio_app
		WITH CHECK (is_group_admin(group_id, current_setting('app.current_user_id', true)));

		CREATE POLICY "group_members_delete" ON librarian.group_members FOR DELETE TO scholio_app
		USING (user_id = current_setting('app.current_user_id', true)
			OR is_group_admin(group_id, current_setting('app.current_user_id', true)));
	`);

	// Las políticas de groups y shared_tags también referencian group_members —
	// reemplazarlas para usar is_group_member / is_group_admin
	await client.exec(`
		DROP POLICY IF EXISTS "groups_select" ON librarian.groups;
		DROP POLICY IF EXISTS "groups_update" ON librarian.groups;
		DROP POLICY IF EXISTS "groups_delete" ON librarian.groups;

		CREATE POLICY "groups_select" ON librarian.groups FOR SELECT TO scholio_app
		USING (is_group_member(id, current_setting('app.current_user_id', true)));

		CREATE POLICY "groups_update" ON librarian.groups FOR UPDATE TO scholio_app
		USING (is_group_admin(id, current_setting('app.current_user_id', true)));

		CREATE POLICY "groups_delete" ON librarian.groups FOR DELETE TO scholio_app
		USING (is_group_admin(id, current_setting('app.current_user_id', true))
			AND NOT is_group_member(id, current_setting('app.current_user_id', true)));

		DROP POLICY IF EXISTS "shared_tags_select" ON librarian.shared_tags;
		DROP POLICY IF EXISTS "shared_tags_insert" ON librarian.shared_tags;
		DROP POLICY IF EXISTS "shared_tags_delete" ON librarian.shared_tags;

		CREATE POLICY "shared_tags_select" ON librarian.shared_tags FOR SELECT TO scholio_app
		USING (is_group_member(group_id, current_setting('app.current_user_id', true)));

		CREATE POLICY "shared_tags_insert" ON librarian.shared_tags FOR INSERT TO scholio_app
		WITH CHECK (shared_by = current_setting('app.current_user_id', true)
			AND is_group_member(group_id, current_setting('app.current_user_id', true)));

		CREATE POLICY "shared_tags_delete" ON librarian.shared_tags FOR DELETE TO scholio_app
		USING (shared_by = current_setting('app.current_user_id', true)
			OR is_group_admin(group_id, current_setting('app.current_user_id', true)));
	`);

	const db = drizzle(client, { schema });

	/**
	 * Ejecuta un callback como scholio_app con el userId seteado en la sesión.
	 * Replica exactamente el comportamiento de withRLS() de producción,
	 * añadiendo SET LOCAL ROLE para activar RLS en PGlite.
	 */
	async function withRLS<T>(userId: string, callback: (tx: typeof db) => Promise<T>): Promise<T> {
		return db.transaction(async (tx) => {
			await tx.execute(sql`SET LOCAL ROLE scholio_app`);
			await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
			await tx.execute(sql`SET LOCAL search_path = librarian, public`);
			return callback(tx as unknown as typeof db);
		});
	}

	/**
	 * Ejecuta como superuser (bypass RLS) — para seed de datos en tests.
	 */
	async function asSuperuser<T>(callback: (tx: typeof db) => Promise<T>): Promise<T> {
		return db.transaction(async (tx) => callback(tx as unknown as typeof db));
	}

	async function cleanup() {
		await client.close();
	}

	return { db, withRLS, asSuperuser, cleanup };
}
