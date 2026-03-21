import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	dialect: 'postgresql',
	dbCredentials: { url: process.env.DATABASE_URL },
	// 'librarian' contiene las tablas de la app.
	// 'public' contiene las tablas de better-auth (gestionadas por better-auth, no por Drizzle).
	schemaFilter: ['librarian'],
	verbose: true,
	strict: true
});
