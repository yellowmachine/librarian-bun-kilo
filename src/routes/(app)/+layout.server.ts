import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

// Protege todas las rutas bajo (app): redirige a /login si no hay sesión
export const load = ({ locals, url }: RequestEvent) => {
	if (!locals.user) {
		redirect(302, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	return {
		user: locals.user,
		session: locals.session!
	};
};
