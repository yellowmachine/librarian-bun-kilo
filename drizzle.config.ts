import { defineConfig } from 'drizzle-kit';

if (!process.env.MIGRATION_DATABASE_URL) throw new Error('MIGRATION_DATABASE_URL is not set');

export default defineConfig({
  schema: './src/lib/server/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.MIGRATION_DATABASE_URL },
  // 'librarian' contiene las tablas de la app.
  // 'public' contiene las tablas de better-auth (gestionadas por better-auth, no por Drizzle).
  migrations: {
    schema: 'librarian',          // o 'public', según qué schema quieras usar
    table: '__drizzle_migrations' // nombre por defecto, configurable si quieres
  },
  schemaFilter: ['librarian'],
  verbose: true,
  strict: true
});
