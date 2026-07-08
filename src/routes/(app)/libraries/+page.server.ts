import { fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getUserLibraries, createLibrary } from '$lib/server/libraries';

export const load = async ({ locals }: RequestEvent) => {
	const userLibraries = await getUserLibraries(locals.user!.id);
	return { userLibraries };
};

export const actions = {
	create: async ({ locals, request }: RequestEvent) => {
		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();

		if (!name) return fail(400, { createError: 'Name is required.' });

		await createLibrary(locals.user!.id, name);
		return { created: true };
	}
};
