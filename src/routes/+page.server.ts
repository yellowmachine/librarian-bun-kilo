import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export const load = ({ locals }: RequestEvent) => {
	if (locals.user) {
		redirect(302, '/library');
	} else {
		redirect(302, '/login');
	}
};
