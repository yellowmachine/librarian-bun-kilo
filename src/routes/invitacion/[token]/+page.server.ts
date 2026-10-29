import { error, fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth, seilide } from '$lib/server/auth';
import { invitations } from '$lib/server/invitations';
import type { Actions, PageServerLoad } from './$types';

/** Lo que invita el enlace: cualquiera que lo tenga puede verlo. */
export const load: PageServerLoad = async ({ params, locals }) => {
	if (locals.user) redirect(303, '/library');
	const invitation = await invitations.byToken(params.token);
	if (!invitation) error(404, 'Esta invitación no existe: puede que te la hayan mandado de nuevo');
	return { invitation, seilide: Boolean(seilide) };
};

/** Los motivos de Better Auth para no crear la cuenta, dichos aquí. */
const SIGN_UP_PROBLEMS: Record<string, string> = {
	USER_ALREADY_EXISTS: 'Ese email ya tiene cuenta: entra con ella',
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Ese email ya tiene cuenta: entra con ella',
	PASSWORD_TOO_SHORT: 'La contraseña, de 10 caracteres por lo menos',
	PASSWORD_TOO_LONG: 'Esa contraseña es demasiado larga'
};

export const actions: Actions = {
	/** Una cuenta nueva con el email de la invitación, y dentro al momento. */
	default: async ({ params, request }) => {
		const invitation = await invitations.byToken(params.token);
		if (!invitation || invitation.status !== 'pending')
			return fail(400, { name: '', message: 'Esta invitación ya no vale' });
		const form = await request.formData();
		const name = String(form.get('name') ?? '')
			.trim()
			.slice(0, 60);
		const password = String(form.get('password') ?? '');
		if (!name) return fail(400, { name, message: 'Escribe tu nombre' });
		if (password !== String(form.get('confirm') ?? ''))
			return fail(400, { name, message: 'Las dos contraseñas no coinciden' });

		let created;
		try {
			// En el servidor: la ruta HTTP /sign-up/email está cerrada (auth-options.ts).
			created = await auth.api.signUpEmail({
				body: { email: invitation.email, password, name },
				headers: request.headers
			});
		} catch (err) {
			if (err instanceof APIError)
				return fail(400, {
					name,
					message: SIGN_UP_PROBLEMS[String(err.body?.code ?? '')] ?? err.message
				});
			throw err;
		}
		await invitations.accept(params.token, created.user);
		// Ya verificado por la invitación: entra con la contraseña recién elegida.
		await auth.api.signInEmail({
			body: { email: invitation.email, password },
			headers: request.headers
		});
		redirect(303, '/library');
	}
};
