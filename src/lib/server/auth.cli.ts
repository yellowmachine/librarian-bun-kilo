// Config que solo usa el CLI de Better Auth (`bun run auth:schema`), que corre
// fuera de Vite y no resuelve los módulos `$app/*` ni `$env/*`. La app usa
// auth.ts — ver createAuthOptions en auth-options.ts.
import { betterAuth } from 'better-auth';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createAuthOptions } from './auth-options';

export const auth = betterAuth(
	createAuthOptions({
		db: drizzle(postgres(process.env.DATABASE_URL ?? 'postgres://cli-only-placeholder')),
		secret: process.env.BETTER_AUTH_SECRET ?? 'cli-only-placeholder-cli-only-placeholder',
		baseURL: process.env.ORIGIN ?? 'http://localhost:5173',
		// Con Seilide, para que el esquema incluya lo que necesite su plugin.
		seilide: { url: 'https://seilide.app', clientId: 'cli', clientSecret: 'cli' },
		sendVerificationEmail: async () => {},
		sendResetPassword: async () => {}
	})
);
