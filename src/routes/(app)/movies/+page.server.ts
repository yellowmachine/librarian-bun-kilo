import type { RequestEvent } from '@sveltejs/kit';
import { getUserMovies, getMoviesFromOthers } from '$lib/server/movies';
import { getUserLibraries } from '$lib/server/libraries';

export const load = async ({ locals, url }: RequestEvent) => {
	const libraryId = url.searchParams.get('libraryId');

	const [userMovies, othersMovies, userLibraries] = await Promise.all([
		getUserMovies(locals.user!.id, libraryId ? { type: 'library', libraryId } : { type: 'all' }),
		// Las que otros comparten en tus grupos (pestaña «From others»)
		getMoviesFromOthers(locals.user!.id),
		getUserLibraries(locals.user!.id)
	]);
	const tab: 'mine' | 'others' = url.searchParams.get('tab') === 'others' ? 'others' : 'mine';
	return { userMovies, othersMovies, userLibraries, libraryId, tab };
};
