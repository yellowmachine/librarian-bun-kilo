import type { RequestEvent } from '@sveltejs/kit';
import { getUserLibraries } from '$lib/server/libraries';
import { isTmdbConfigured } from '$lib/server/tmdb';
import { hasOpenRouterApiKey } from '$lib/server/openrouterKey';

export const load = async ({ locals, url }: RequestEvent) => {
	const [userLibraries, canScan] = await Promise.all([
		getUserLibraries(locals.user!.id),
		// El alta por foto usa la clave de OpenRouter del usuario (/account)
		hasOpenRouterApiKey(locals.user!.id)
	]);
	const fromUrl = url.searchParams.get('libraryId');
	const initialLibraryId =
		userLibraries.find((lib) => lib.id === fromUrl)?.id ??
		userLibraries.find((lib) => lib.isDefault)?.id ??
		userLibraries[0]?.id ??
		'';

	return { tmdbEnabled: isTmdbConfigured(), canScan, userLibraries, initialLibraryId };
};
