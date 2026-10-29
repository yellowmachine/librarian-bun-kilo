import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import type { RequestEvent } from '@sveltejs/kit';

export const actions = {
	default: async ({ request }: RequestEvent) => {
		await auth.api.signOut({ headers: request.headers });
		redirect(302, '/login');
	}
};
