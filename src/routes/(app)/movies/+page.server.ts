import type { RequestEvent } from '@sveltejs/kit';
import {
	getUserMovies,
	getMoviesFromOthers,
	getContactMovies,
	getGroupMovies
} from '$lib/server/movies';
import { getContacts, getUserGroups } from '$lib/server/groups';
import { getUserLibraries } from '$lib/server/libraries';

export type MoviesTab = 'mine' | 'contacts' | 'groups' | 'search';
const TABS: MoviesTab[] = ['mine', 'contacts', 'groups', 'search'];

// Como en /library: la tab y el contacto o grupo elegido van en la URL para que
// volver atrás desde una ficha deje al usuario donde estaba.
export const load = async ({ locals, url }: RequestEvent) => {
	const userId = locals.user!.id;
	const libraryId = url.searchParams.get('libraryId');
	const tabParam = url.searchParams.get('tab') as MoviesTab | null;
	// «others» era la tab de antes: los enlaces viejos acaban en Search
	const tab: MoviesTab =
		tabParam === ('others' as string)
			? 'search'
			: tabParam && TABS.includes(tabParam)
				? tabParam
				: 'mine';

	const contactId = tab === 'contacts' ? url.searchParams.get('contact') : null;
	const groupId = tab === 'groups' ? url.searchParams.get('group') : null;

	const [userMovies, contacts, groups, userLibraries] = await Promise.all([
		getUserMovies(userId, libraryId ? { type: 'library', libraryId } : { type: 'all' }),
		getContacts(userId),
		getUserGroups(userId),
		getUserLibraries(userId)
	]);

	const selectedContact = contactId ? (contacts.find((c) => c.userId === contactId) ?? null) : null;
	const selectedGroup = groupId ? (groups.find((g) => g.id === groupId) ?? null) : null;

	// Lo que se lista en la tab activa (salvo «mine», que es userMovies)
	const othersMovies = selectedContact
		? await getContactMovies(userId, selectedContact.userId)
		: selectedGroup
			? await getGroupMovies(userId, selectedGroup.id)
			: tab === 'search'
				? await getMoviesFromOthers(userId)
				: [];

	return {
		tab,
		userMovies,
		othersMovies,
		contacts,
		groups: groups.sort((a, b) => a.name.localeCompare(b.name)),
		userLibraries,
		libraryId,
		selectedContact,
		selectedGroup: selectedGroup && { id: selectedGroup.id, name: selectedGroup.name }
	};
};
