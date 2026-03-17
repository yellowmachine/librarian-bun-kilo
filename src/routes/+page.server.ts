import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { user } from '$lib/server/db/schema';

export const load = async ({ locals }: RequestEvent) => {
	// Si no hay ningún usuario en la BD, la app acaba de levantarse por primera vez
	const rows = await db.select({ id: user.id }).from(user).limit(1);
	if (rows.length === 0) redirect(302, '/setup');

	if (locals.user) redirect(302, '/library');
	redirect(302, '/login');
};
