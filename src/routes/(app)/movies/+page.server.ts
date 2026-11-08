import type { RequestEvent } from '@sveltejs/kit';
import { getUserMovies } from '$lib/server/movies';
import { getUserLibraries } from '$lib/server/libraries';

export const load = async ({ locals, url }: RequestEvent) => {
	const libraryId = url.searchParams.get('libraryId');

	const [userMovies, userLibraries] = await Promise.all([
		getUserMovies(locals.user!.id, libraryId ? { type: 'library', libraryId } : { type: 'all' }),
		getUserLibraries(locals.user!.id)
	]);
	return { userMovies, userLibraries, libraryId };
};
