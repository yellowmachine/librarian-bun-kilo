/**
 * Factory de base de datos para tests.
 *
 * Cada llamada a createTestDb() crea una instancia PGlite completamente aislada
 * con la migración aplicada y app_user configurado. Los archivos de test pueden
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

	// Equivalente a init.sql: crear app_user y default privileges
	await client.exec('CREATE ROLE app_user;');
	await client.exec('GRANT USAGE ON SCHEMA public TO app_user;');
	await client.exec(
		'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;'
	);
	await client.exec(
		'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app_user;'
	);

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
		$$ SELECT EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = p_user_id) $$;

		CREATE OR REPLACE FUNCTION is_group_admin(p_group_id text, p_user_id text)
		RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS
		$$ SELECT EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = p_user_id AND role IN ('owner', 'admin')) $$;
	`);

	// Reemplazar políticas recursivas en group_members
	await client.exec(`
		DROP POLICY IF EXISTS "group_members_select" ON group_members;
		DROP POLICY IF EXISTS "group_members_insert" ON group_members;
		DROP POLICY IF EXISTS "group_members_delete" ON group_members;

		CREATE POLICY "group_members_select" ON group_members FOR SELECT TO app_user
		USING (user_id = current_setting('app.current_user_id', true)
			OR is_group_member(group_id, current_setting('app.current_user_id', true)));

		CREATE POLICY "group_members_insert" ON group_members FOR INSERT TO app_user
		WITH CHECK (is_group_admin(group_id, current_setting('app.current_user_id', true)));

		CREATE POLICY "group_members_delete" ON group_members FOR DELETE TO app_user
		USING (user_id = current_setting('app.current_user_id', true)
			OR is_group_admin(group_id, current_setting('app.current_user_id', true)));
	`);

	// Las políticas de groups y shared_tags también referencian group_members —
	// reemplazarlas para usar is_group_member / is_group_admin
	await client.exec(`
		DROP POLICY IF EXISTS "groups_select" ON groups;
		DROP POLICY IF EXISTS "groups_update" ON groups;
		DROP POLICY IF EXISTS "groups_delete" ON groups;

		CREATE POLICY "groups_select" ON groups FOR SELECT TO app_user
		USING (is_group_member(id, current_setting('app.current_user_id', true)));

		CREATE POLICY "groups_update" ON groups FOR UPDATE TO app_user
		USING (is_group_admin(id, current_setting('app.current_user_id', true)));

		CREATE POLICY "groups_delete" ON groups FOR DELETE TO app_user
		USING (is_group_admin(id, current_setting('app.current_user_id', true))
			AND NOT is_group_member(id, current_setting('app.current_user_id', true)));

		DROP POLICY IF EXISTS "shared_tags_select" ON shared_tags;
		DROP POLICY IF EXISTS "shared_tags_insert" ON shared_tags;
		DROP POLICY IF EXISTS "shared_tags_delete" ON shared_tags;

		CREATE POLICY "shared_tags_select" ON shared_tags FOR SELECT TO app_user
		USING (is_group_member(group_id, current_setting('app.current_user_id', true)));

		CREATE POLICY "shared_tags_insert" ON shared_tags FOR INSERT TO app_user
		WITH CHECK (shared_by = current_setting('app.current_user_id', true)
			AND is_group_member(group_id, current_setting('app.current_user_id', true)));

		CREATE POLICY "shared_tags_delete" ON shared_tags FOR DELETE TO app_user
		USING (shared_by = current_setting('app.current_user_id', true)
			OR is_group_admin(group_id, current_setting('app.current_user_id', true)));
	`);

	const db = drizzle(client, { schema });

	/**
	 * Ejecuta un callback como app_user con el userId seteado en la sesión.
	 * Replica exactamente el comportamiento de withRLS() de producción,
	 * añadiendo SET LOCAL ROLE para activar RLS en PGlite.
	 */
	async function withRLS<T>(userId: string, callback: (tx: typeof db) => Promise<T>): Promise<T> {
		return db.transaction(async (tx) => {
			await tx.execute(sql`SET LOCAL ROLE app_user`);
			await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
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
