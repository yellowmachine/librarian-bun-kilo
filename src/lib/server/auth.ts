import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { sendVerificationEmail } from '$lib/server/email';

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	// Permite peticiones de auth desde cualquiera de las dos apps del ecosistema.
	// En dev se usan los puertos de localhost; en producción los subdominios reales.
	trustedOrigins: env.TRUSTED_ORIGINS ? env.TRUSTED_ORIGINS.split(',') : [],
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: true
	},
	emailVerification: {
		sendOnSignUp: true,
		autoSignInAfterVerification: true,
		expiresIn: 60 * 60 * 24, // 24 horas
		sendVerificationEmail: async ({ user, url }) => {
			await sendVerificationEmail(user.email, url);
		}
	},
	socialProviders: {
		...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
			? {
					github: {
						clientId: env.GITHUB_CLIENT_ID,
						clientSecret: env.GITHUB_CLIENT_SECRET
					}
				}
			: {})
	},
	advanced: {
		// Cookie compartida entre subdominios (ej: .scholio.review).
		// En dev COOKIE_DOMAIN está vacío → cookie sin domain, solo funciona en localhost.
		...(env.COOKIE_DOMAIN
			? {
					cookies: {
						session_token: {
							attributes: {
								domain: env.COOKIE_DOMAIN,
								sameSite: 'lax' as const,
								secure: true
							}
						}
					}
				}
			: {})
	},
	plugins: [sveltekitCookies(getRequestEvent)] // make sure this is the last plugin in the array
});
