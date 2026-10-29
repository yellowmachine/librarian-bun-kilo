import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => ({
	token: url.searchParams.get('token'),
	// Better Auth manda aquí ?error=INVALID_TOKEN si el enlace caducó o ya se usó.
	invalid: url.searchParams.has('error')
});

export const actions: Actions = {
	default: async ({ request, url }) => {
		const form = await request.formData();
		const token = url.searchParams.get('token') ?? '';
		const newPassword = String(form.get('password') ?? '');
		if (newPassword !== String(form.get('confirm') ?? ''))
			return fail(400, { message: 'Las dos contraseñas no coinciden' });
		try {
			await auth.api.resetPassword({ body: { token, newPassword }, headers: request.headers });
		} catch (err) {
			if (err instanceof APIError) {
				const code = String(err.body?.code ?? '');
				return fail(400, {
					message:
						code === 'PASSWORD_TOO_SHORT'
							? 'La contraseña, de 10 caracteres por lo menos'
							: code === 'INVALID_TOKEN'
								? 'Este enlace ya no vale: pide otro'
								: err.message
				});
			}
			throw err;
		}
		redirect(303, '/login?password-changed');
	}
};
