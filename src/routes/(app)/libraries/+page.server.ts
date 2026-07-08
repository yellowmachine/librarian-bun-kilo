import { fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import {
	getUserLibraries,
	createLibrary,
	renameLibrary,
	deleteLibrary,
	setDefaultLibrary
} from '$lib/server/libraries';

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
	},

	rename: async ({ locals, request }: RequestEvent) => {
		const data = await request.formData();
		const libraryId = (data.get('libraryId') as string)?.trim();
		const name = (data.get('name') as string)?.trim();

		if (!libraryId || !name) return fail(400, { renameError: 'Name is required.' });

		await renameLibrary(locals.user!.id, libraryId, name);
		return { renamed: true };
	},

	setDefault: async ({ locals, request }: RequestEvent) => {
		const data = await request.formData();
		const libraryId = (data.get('libraryId') as string)?.trim();
		if (!libraryId) return fail(400, { setDefaultError: 'libraryId is required.' });

		try {
			await setDefaultLibrary(locals.user!.id, libraryId);
		} catch (e) {
			return fail(400, {
				setDefaultError: e instanceof Error ? e.message : 'Error setting default library.'
			});
		}

		return { setDefault: true };
	},

	delete: async ({ locals, request }: RequestEvent) => {
		const data = await request.formData();
		const libraryId = (data.get('libraryId') as string)?.trim();
		if (!libraryId) return fail(400, { deleteError: 'libraryId is required.' });

		try {
			await deleteLibrary(locals.user!.id, libraryId);
		} catch (e) {
			return fail(400, { deleteError: e instanceof Error ? e.message : 'Error deleting library.' });
		}

		return { deleted: true };
	}
};
