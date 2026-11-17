import type { RequestEvent } from '@sveltejs/kit';
import { getUserBooks, getContactBooks } from '$lib/server/books';
import {
	searchBooksFromOthers,
	getContacts,
	getSharedTagsForUser,
	getUserGroups,
	getGroupBooks
} from '$lib/server/groups';
import { getUserLibraries } from '$lib/server/libraries';

export type LibraryTab = 'mine' | 'contacts' | 'groups' | 'search';
const TABS: LibraryTab[] = ['mine', 'contacts', 'groups', 'search'];

// Todo el estado de la página va en la URL (tab, contacto, grupo, búsqueda) para
// que volver atrás desde la ficha de un libro deje al usuario donde estaba.
export const load = async ({ locals, url }: RequestEvent) => {
	const userId = locals.user!.id;
	const libraryId = url.searchParams.get('libraryId');
	const tabParam = url.searchParams.get('tab') as LibraryTab | null;
	const tab: LibraryTab = tabParam && TABS.includes(tabParam) ? tabParam : 'mine';

	const contactId = tab === 'contacts' ? url.searchParams.get('contact') : null;
	const groupId = tab === 'groups' ? url.searchParams.get('group') : null;
	const query = tab === 'search' ? (url.searchParams.get('q')?.trim() ?? '') : '';
	const searchTagIds = tab === 'search' ? url.searchParams.getAll('tag') : [];
	const searched = query !== '' || searchTagIds.length > 0;

	const [userBooks, contacts, groups, sharedTagsForOthers, userLibraries] = await Promise.all([
		getUserBooks(userId, libraryId ? { type: 'library', libraryId } : { type: 'all' }),
		getContacts(userId),
		getUserGroups(userId),
		tab === 'search' ? getSharedTagsForUser(userId) : Promise.resolve([]),
		getUserLibraries(userId)
	]);

	const selectedContact = contactId ? (contacts.find((c) => c.userId === contactId) ?? null) : null;
	const selectedGroup = groupId ? (groups.find((g) => g.id === groupId) ?? null) : null;

	const [contactBooks, groupBooks, searchResults] = await Promise.all([
		selectedContact ? getContactBooks(userId, selectedContact.userId) : null,
		selectedGroup ? getGroupBooks(userId, selectedGroup.id) : null,
		searched ? searchBooksFromOthers(userId, query, searchTagIds) : null
	]);

	return {
		tab,
		userBooks,
		contacts,
		groups: groups.sort((a, b) => a.name.localeCompare(b.name)),
		sharedTagsForOthers,
		userLibraries,
		libraryId,
		selectedContact,
		contactBooks,
		selectedGroup: selectedGroup && { id: selectedGroup.id, name: selectedGroup.name },
		groupBooks,
		search: { query, tagIds: searchTagIds, results: searchResults }
	};
};
