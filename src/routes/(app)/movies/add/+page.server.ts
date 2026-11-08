import type { RequestEvent } from '@sveltejs/kit';
import { getUserLibraries } from '$lib/server/libraries';
import { isTmdbConfigured } from '$lib/server/tmdb';

export const load = async ({ locals, url }: RequestEvent) => {
	const userLibraries = await getUserLibraries(locals.user!.id);
	const fromUrl = url.searchParams.get('libraryId');
	const initialLibraryId =
		userLibraries.find((lib) => lib.id === fromUrl)?.id ??
		userLibraries.find((lib) => lib.isDefault)?.id ??
		userLibraries[0]?.id ??
		'';

	return { tmdbEnabled: isTmdbConfigured(), userLibraries, initialLibraryId };
};
