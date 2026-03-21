import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';

export const load = async ({ locals }: RequestEvent) => {
	// Si el usuario ya tiene perfil de Librarian, no tiene que estar aquí
	if (locals.hasLibrarianProfile) {
		redirect(302, '/library');
	}

	return { user: locals.user ?? null };
};

export const actions = {
	logout: async ({ request }: RequestEvent) => {
		await auth.api.signOut({ headers: request.headers });
		redirect(302, '/login');
	}
};
