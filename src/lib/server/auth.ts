import { betterAuth } from 'better-auth/minimal';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { sendResetPasswordEmail, sendVerificationEmail } from '$lib/server/email';
import { createAuthOptions, seilideFromEnv } from '$lib/server/auth-options';

/** Seilide configurado (las tres SEILIDE_*): sale el botón «Entrar con Seilide». */
export const seilide = seilideFromEnv(env);

export const auth = betterAuth(
	createAuthOptions({
		db,
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.ORIGIN,
		seilide,
		sendVerificationEmail,
		sendResetPassword: sendResetPasswordEmail,
		plugins: [sveltekitCookies(getRequestEvent)] // make sure this is the last plugin in the array
	})
);
