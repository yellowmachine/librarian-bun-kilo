import { fail } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request }) => {
		const email = String((await request.formData()).get('email') ?? '').trim();
		if (!email) return fail(400, { message: 'Escribe tu email' });
		// Better Auth contesta igual exista o no la cuenta: no se revela quién está dentro.
		// El enlace del correo pasa por /api/auth/reset-password/<token> y vuelve a
		// /reset-password?token=…
		await auth.api.requestPasswordReset({
			body: { email, redirectTo: '/reset-password' },
			headers: request.headers
		});
		return { sent: true, email };
	}
};
