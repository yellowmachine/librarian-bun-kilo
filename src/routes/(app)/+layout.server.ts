import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getPendingCount } from '$lib/server/loans';

// Protege todas las rutas bajo (app): redirige a /login si no hay sesión,
// o a /no-access si el usuario tiene cuenta de Scholio pero no de Librarian.
export const load = async ({ locals, url }: RequestEvent) => {
	if (!locals.user) {
		redirect(302, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
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
