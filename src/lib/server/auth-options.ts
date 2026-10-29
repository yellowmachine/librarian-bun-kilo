import type { BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { genericOAuth } from 'better-auth/plugins';
import { APIError } from 'better-auth/api';
import * as authSchema from './db/auth.schema';

type Db = Parameters<typeof drizzleAdapter>[0];

export const SEILIDE_PROVIDER_ID = 'seilide';

/** El ?error= con el que vuelve a /login quien entra con Seilide sin email verificado. */
export const SEILIDE_EMAIL_NOT_VERIFIED = 'email_not_verified';

export interface SeilideConfig {
	url: string;
	clientId: string;
	clientSecret: string;
}

/** SEILIDE_URL, SEILIDE_CLIENT_ID y SEILIDE_CLIENT_SECRET, o null si falta alguna: sin botón. */
export function seilideFromEnv(env: Record<string, string | undefined>): SeilideConfig | null {
	const {
		SEILIDE_URL: url,
		SEILIDE_CLIENT_ID: clientId,
		SEILIDE_CLIENT_SECRET: clientSecret
	} = env;
	return url && clientId && clientSecret
		? { url: url.replace(/\/+$/, ''), clientId, clientSecret }
		: null;
}

/**
 * Compartida entre la instancia de la app (auth.ts) y la del CLI de Better Auth
 * (auth.cli.ts, para generar auth.schema.ts). Sin imports de `$app/*` ni `$env/*`,
 * que el CLI no resuelve fuera de Vite; también la usan los tests.
 */
export function createAuthOptions(params: {
	db: Db;
	secret: string | undefined;
	baseURL: string | undefined;
	seilide: SeilideConfig | null;
	sendVerificationEmail: (to: string, url: string) => Promise<void>;
	sendResetPassword: (to: string, url: string) => Promise<void>;
	plugins?: BetterAuthOptions['plugins'];
}) {
	return {
		database: drizzleAdapter(params.db, { provider: 'pg', schema: authSchema }),
		secret: params.secret,
		baseURL: params.baseURL,
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
			minPasswordLength: 10,
			resetPasswordTokenExpiresIn: 60 * 60, // 1 hora
			sendResetPassword: async ({ user, url }) => {
				await params.sendResetPassword(user.email, url);
			}
		},
		emailVerification: {
			// Las cuentas con contraseña nacen de una invitación, cuyo enlace ya llegó
			// a ese correo: la invitación verifica el email (invitation-store.ts). Si
			// aun así alguien sin verificar intenta entrar, se le manda el enlace.
			sendOnSignUp: false,
			sendOnSignIn: true,
			autoSignInAfterVerification: true,
			expiresIn: 60 * 60 * 24, // 24 horas
			sendVerificationEmail: async ({ user, url }) => {
				await params.sendVerificationEmail(user.email, url);
			}
		},
		// Nadie se registra solo: las cuentas con contraseña se crean desde una
		// invitación (/invitacion/<token>), que llama a auth.api.signUpEmail en el
		// servidor. disabledPaths solo cierra la ruta HTTP, no esa llamada.
		disabledPaths: ['/sign-up/email'],
		// Quien entra con Seilide ya está invitado allí: su cuenta se crea al
		// momento. Si ya tenía una con ese email, se enlaza; desde entonces se le
		// reconoce por el `sub` (account.account_id), no por el email. Seilide no es
		// «de confianza» (trustedProviders): Better Auth solo enlaza si Seilide dice
		// email_verified, y el hook de user.create no deja crear la cuenta si no.
		account: {
			accountLinking: { enabled: true }
		},
		databaseHooks: {
			user: {
				create: {
					/**
					 * Ninguna cuenta nace de Seilide con un email sin verificar. Si no, alguien
					 * podría ocupar en Librarian el email de otro, y su dueño, al entrar luego
					 * con Seilide y el email ya verificado, acabaría enlazado a esa cuenta.
					 * Better Auth lleva el mensaje a /login como ?error=email_not_verified.
					 */
					before: async (user, ctx) => {
						if (ctx?.params?.providerId === SEILIDE_PROVIDER_ID && !user.emailVerified)
							throw new APIError('FORBIDDEN', { message: SEILIDE_EMAIL_NOT_VERIFIED });
					}
				}
			},
			account: {
				create: {
					/**
					 * Seilide enlazado a una cuenta cuyo email nadie había verificado: su
					 * contraseña se borra. Si no, quien la hubiera creado con el email de otro
					 * seguiría entrando en ella con la suya. Better Auth enlaza antes de
					 * marcar el email verificado, así que aquí aún se ve sin verificar.
					 */
					after: async (account, ctx) => {
						if (account.providerId !== SEILIDE_PROVIDER_ID || !ctx) return;
						const adapter = ctx.context.internalAdapter;
						const owner = await adapter.findUserById(account.userId);
						if (!owner || owner.emailVerified) return;
						for (const other of await adapter.findAccounts(account.userId)) {
							if (other.providerId === 'credential') await adapter.deleteAccount(other.id);
						}
					}
				}
			}
		},
		plugins: [
			...(params.seilide
				? [
						genericOAuth({
							config: [
								{
									providerId: SEILIDE_PROVIDER_ID,
									discoveryUrl: `${params.seilide.url}/api/auth/.well-known/openid-configuration`,
									clientId: params.seilide.clientId,
									clientSecret: params.seilide.clientSecret,
									authentication: 'basic',
									pkce: true,
									// Ni `family` ni `offline_access`: Librarian no es una app de
									// familia ni llama a Seilide después de entrar.
									scopes: ['openid', 'profile', 'email']
								}
							]
						})
					]
				: []),
			...(params.plugins ?? [])
		]
	} satisfies BetterAuthOptions;
}
