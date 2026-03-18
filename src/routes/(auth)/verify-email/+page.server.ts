import { fail, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import type { RequestEvent } from '@sveltejs/kit';

export const load = ({ locals }: RequestEvent) => {
	// Si el usuario ya está verificado y autenticado, no necesita estar aquí
	if (locals.user?.emailVerified) redirect(302, '/library');
};

export const actions = {
	resend: async ({ request }: RequestEvent) => {
		const data = await request.formData();
		const email = (data.get('email') as string)?.trim();

		if (!email) return fail(400, { error: 'El email es obligatorio' });

		try {
			await auth.api.sendVerificationEmail({
				body: { email },
				headers: request.headers
			});
		} catch {
			// No revelamos si el email existe o no por seguridad
		}

		// Respuesta siempre positiva para no revelar si el email está registrado
		return { resent: true };
	}
};
