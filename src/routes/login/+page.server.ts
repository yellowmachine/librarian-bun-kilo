import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth, seilide } from '$lib/server/auth';
import { SEILIDE_EMAIL_NOT_VERIFIED, SEILIDE_PROVIDER_ID } from '$lib/server/auth-options';
import { safeNext } from '$lib/auth-form';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const next = safeNext(url.searchParams.get('next'));
	if (locals.user) redirect(303, next);
	return {
		next,
		seilide: Boolean(seilide),
		// Better Auth vuelve aquí con ?error=… si el login con Seilide falla
		// (cancelado, rechazado, cliente mal configurado…).
		seilideProblem: seilideProblem(url.searchParams.get('error')),
		// Tras cambiar la contraseña (/reset-password).
		passwordChanged: url.searchParams.has('password-changed')
	};
};

/** Por qué no se pudo entrar con Seilide, dicho aquí; null si no hubo error. */
function seilideProblem(error: string | null): string | null {
	if (error === null) return null;
	if (error === SEILIDE_EMAIL_NOT_VERIFIED || error === 'account_not_linked')
		return 'Seilide no tiene tu email verificado, así que no podemos saber que es tuyo. Pide que te lo verifiquen en Seilide y vuelve a intentarlo.';
	return 'No se pudo entrar con Seilide. Vuelve a intentarlo.';
}

/** Los motivos de Better Auth para no dejar entrar, dichos aquí. */
const SIGN_IN_PROBLEMS: Record<string, string> = {
	INVALID_EMAIL_OR_PASSWORD: 'El email o la contraseña no son correctos',
	EMAIL_NOT_VERIFIED: 'Tienes que confirmar tu email: te hemos mandado un enlace'
};

export const actions: Actions = {
	password: async ({ request, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		if (!email || !password)
			return fail(400, { email, message: 'Escribe tu email y tu contraseña' });
		try {
			await auth.api.signInEmail({ body: { email, password }, headers: request.headers });
		} catch (err) {
			if (err instanceof APIError)
				return fail(400, {
					email,
					message: SIGN_IN_PROBLEMS[String(err.body?.code ?? '')] ?? err.message
				});
			throw err;
		}
		redirect(303, safeNext(url.searchParams.get('next')));
	},

	seilide: async ({ request, url }) => {
		if (!seilide) return fail(404, { message: 'Entrar con Seilide no está disponible' });
		const next = safeNext(url.searchParams.get('next'));
		const { url: authorize } = await auth.api.signInWithOAuth2({
			body: {
				providerId: SEILIDE_PROVIDER_ID,
				callbackURL: next,
				errorCallbackURL: `/login?next=${encodeURIComponent(next)}`
			},
			headers: request.headers
		});
		redirect(303, authorize);
	}
};
