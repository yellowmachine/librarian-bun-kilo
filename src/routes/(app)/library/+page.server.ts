import type { RequestEvent } from '@sveltejs/kit';
import { getUserBooks, getLibraryLetters, type LibraryFilter } from '$lib/server/books';

export const load = async ({ locals, url }: RequestEvent) => {
	const letter = url.searchParams.get('letter')?.toUpperCase() ?? null;
	const by = (url.searchParams.get('by') ?? 'title') as 'title' | 'author';

	const filter: LibraryFilter = letter ? { type: 'letter', letter, by } : { type: 'recent' };

	const [userBooks, titleLetters, authorLetters] = await Promise.all([
		getUserBooks(locals.user!.id, filter),
		getLibraryLetters(locals.user!.id, 'title'),
		getLibraryLetters(locals.user!.id, 'author')
	]);

	return { userBooks, letter, by, titleLetters, authorLetters };
};
