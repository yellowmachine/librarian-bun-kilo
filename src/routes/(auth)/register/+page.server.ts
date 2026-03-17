import { fail, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import type { RequestEvent } from '@sveltejs/kit';

export const load = ({ locals }: RequestEvent) => {
	if (locals.user) redirect(302, '/library');
};

export const actions = {
	default: async ({ request }: RequestEvent) => {
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const email = String(data.get('email') ?? '').trim();
		const password = String(data.get('password') ?? '');

		if (!name || !email || !password) {
			return fail(400, { error: 'Todos los campos son obligatorios' });
		}

		if (password.length < 8) {
			return fail(400, { error: 'La contraseña debe tener al menos 8 caracteres' });
		}

		const result = await auth.api.signUpEmail({
			body: { name, email, password },
			headers: request.headers
		});

		if (!result || result.user == null) {
			return fail(400, { error: 'No se pudo crear la cuenta. El email puede estar en uso.' });
		}

		redirect(302, '/library');
	}
};
