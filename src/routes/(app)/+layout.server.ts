import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getPendingCount } from '$lib/server/loans';

// Protege todas las rutas bajo (app): redirige a /login si no hay sesión
export const load = async ({ locals, url }: RequestEvent) => {
	if (!locals.user) {
		redirect(302, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	const pendingLoans = await getPendingCount(locals.user.id);

	return {
		user: locals.user,
		session: locals.session!,
		pendingLoans
	};
};
