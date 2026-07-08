import type { RequestEvent } from '@sveltejs/kit';
import { getUserBooks, getContactBooks } from '$lib/server/books';
import { searchBooksFromOthers, getContacts, getSharedTagsForUser } from '$lib/server/groups';
import { getUserLibraries } from '$lib/server/libraries';

export const load = async ({ locals, url }: RequestEvent) => {
	const libraryId = url.searchParams.get('libraryId');

	const [userBooks, contacts, sharedTagsForOthers, userLibraries] = await Promise.all([
		getUserBooks(locals.user!.id, libraryId ? { type: 'library', libraryId } : { type: 'all' }),
		getContacts(locals.user!.id),
		getSharedTagsForUser(locals.user!.id),
		getUserLibraries(locals.user!.id)
	]);
	return { userBooks, contacts, sharedTagsForOthers, userLibraries, libraryId };
};

export const actions = {
	searchOthers: async ({ locals, request }: RequestEvent) => {
		const data = await request.formData();
		const query = (data.get('query') as string)?.trim() ?? '';
		const tagIds = data.getAll('tagIds') as string[];
		const results = await searchBooksFromOthers(
			locals.user!.id,
			query,
			tagIds.length ? tagIds : undefined
		);
		return { othersResults: results, othersQuery: query, othersTagIds: tagIds };
	},

	contactBooks: async ({ locals, request }: RequestEvent) => {
		const data = await request.formData();
		const contactId = (data.get('contactId') as string)?.trim() ?? '';
		if (!contactId) return { contactBooks: [], contactId: '' };
		const results = await getContactBooks(locals.user!.id, contactId);
		return { contactBooks: results, contactId };
	}
};
