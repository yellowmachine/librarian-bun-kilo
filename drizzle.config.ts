import { defineConfig } from 'drizzle-kit';

if (!process.env.MIGRATION_DATABASE_URL) throw new Error('MIGRATION_DATABASE_URL is not set');

export default defineConfig({
	// schema.ts reexporta auth.schema.ts: las tablas de Better Auth y las de la app
	// viven juntas en 'public' y salen en las mismas migraciones.
	schema: './src/lib/server/db/schema.ts',
	dialect: 'postgresql',
	dbCredentials: { url: process.env.MIGRATION_DATABASE_URL },
	verbose: true,
	strict: true
});
