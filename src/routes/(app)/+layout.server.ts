import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getPendingCount } from '$lib/server/loans';

// Protege todas las rutas bajo (app): redirige a Scholio si no hay sesión,
// o a /no-access si el usuario tiene cuenta de Scholio pero no de Librarian.
export const load = async ({ locals }: RequestEvent) => {
	if (!locals.user) {
		redirect(302, env.SCHOLIO_REDIRECT ?? 'https://scholio.review');
	}

	if (!locals.hasLibrarianProfile) {
		redirect(302, '/no-access');
	}

	const pendingLoans = await getPendingCount(locals.user.id);

	return {
		user: locals.user,
		session: locals.session!,
		pendingLoans
	};
};
