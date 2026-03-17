import type { RequestEvent } from '@sveltejs/kit';

// Propaga el usuario y la sesión a todas las páginas via data.user
export const load = ({ locals }: RequestEvent) => {
	return {
		user: locals.user ?? null,
		session: locals.session ?? null
	};
};
