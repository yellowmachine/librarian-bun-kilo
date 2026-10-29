import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getPendingCount } from '$lib/server/loans';

// Protege todas las rutas bajo (app): sin sesión, al login, y de vuelta aquí.
export const load = async ({ locals, url }: RequestEvent) => {
	if (!locals.user) {
		redirect(302, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	}

	const pendingLoans = await getPendingCount(locals.user.id);

	return {
		user: locals.user,
		session: locals.session!,
		pendingLoans
	};
};
