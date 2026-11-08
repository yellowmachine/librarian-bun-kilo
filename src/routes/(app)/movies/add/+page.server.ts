import type { RequestEvent } from '@sveltejs/kit';
import { getUserLibraries } from '$lib/server/libraries';
import { isTmdbConfigured } from '$lib/server/tmdb';
import { hasOpenRouterApiKey } from '$lib/server/openrouterKey';
import { eq } from 'drizzle-orm';
import { withRLS } from '$lib/server/db/rls';
import { tags } from '$lib/server/db/schema';

export const load = async ({ locals, url }: RequestEvent) => {
	const userId = locals.user!.id;
	const [userLibraries, hasAiKey, userTags] = await Promise.all([
		getUserLibraries(userId),
		// La foto y las etiquetas sugeridas usan la clave de OpenRouter del usuario
		hasOpenRouterApiKey(userId),
		withRLS(userId, (tx) =>
			tx
				.select({ id: tags.id, name: tags.name, color: tags.color })
				.from(tags)
				.where(eq(tags.userId, userId))
				.orderBy(tags.name)
		)
	]);
	const fromUrl = url.searchParams.get('libraryId');
	const initialLibraryId =
		userLibraries.find((lib) => lib.id === fromUrl)?.id ??
		userLibraries.find((lib) => lib.isDefault)?.id ??
		userLibraries[0]?.id ??
		'';

	return {
		tmdbEnabled: isTmdbConfigured(),
		canScan: hasAiKey,
		hasAiKey,
		userLibraries,
		userTags,
		initialLibraryId
	};
};
