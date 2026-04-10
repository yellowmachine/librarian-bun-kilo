import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { sendVerificationEmail } from '$lib/server/email';
import * as authSchema from '$lib/server/db/auth.schema';

// Extrae el dominio base (ej: scholio.review) desde el hostname para que la
// cookie de sesión sea compartida entre scholio.review y librarian.scholio.review.
// En localhost devuelve null: no se activa crossSubDomainCookies.
function baseDomain(origin: string): string | null {
  try {
    const { hostname } = new URL(origin);
    if (hostname === 'localhost' || hostname === '127.0.0.1') return null;
    const parts = hostname.split('.');
    return parts.length >= 2 ? parts.slice(-2).join('.') : null;
  } catch {
    return null;
  }
}

const domain = baseDomain(env.ORIGIN);

export const auth = betterAuth({
  baseURL: env.ORIGIN,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: authSchema,
  }),
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
    // domain explícito porque baseURL es librarian.scholio.review, no scholio.review
    ...(domain ? { crossSubDomainCookies: { enabled: true, domain } } : {})
  },
  plugins: [sveltekitCookies(getRequestEvent)] // make sure this is the last plugin in the array
});
