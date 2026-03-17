import { fail, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import type { RequestEvent } from '@sveltejs/kit';

export const load = ({ locals, url }: RequestEvent) => {
	// Si ya está autenticado, redirigir a la app
	if (locals.user) {
		redirect(302, url.searchParams.get('redirectTo') ?? '/library');
	}
};

export const actions = {
	default: async ({ request, url }: RequestEvent) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '');
		const password = String(data.get('password') ?? '');

		if (!email || !password) {
			return fail(400, { error: 'Email y contraseña son obligatorios' });
		}

		const result = await auth.api.signInEmail({
			body: { email, password },
			headers: request.headers
		});

		if (!result || result.user == null) {
			return fail(401, { error: 'Email o contraseña incorrectos' });
		}

		redirect(302, url.searchParams.get('redirectTo') ?? '/library');
	}
};
