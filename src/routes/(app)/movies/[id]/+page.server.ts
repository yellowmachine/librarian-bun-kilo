import { error, fail, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import {
	getUserMovie,
	updateUserMovie,
	removeMovie,
	applyMovieTags,
	removeMovieTag,
	forViewer
} from '$lib/server/movies';
import { withRLS } from '$lib/server/db/rls';
import { hasOpenRouterApiKey } from '$lib/server/openrouterKey';
import { tags } from '$lib/server/db/schema';
import { getUserLibraries } from '$lib/server/libraries';
import { isMediaFormat } from '$lib/mediaFormat';

export const load = async ({ locals, params }: RequestEvent) => {
	const userId = locals.user!.id;
	const [movie, userLibraries, userTags, hasAiKey] = await Promise.all([
		getUserMovie(userId, params.id!),
		getUserLibraries(userId),
		withRLS(userId, (tx) =>
			tx
				.select({ id: tags.id, name: tags.name, color: tags.color })
				.from(tags)
				.where(eq(tags.userId, userId))
				.orderBy(tags.name)
		),
		hasOpenRouterApiKey(userId)
	]);
	// También entra quien la ve por un grupo: ficha de solo lectura, sin lo
	// privado del dueño (notas, biblioteca). La RLS decide quién la ve.
	if (!movie) error(404, 'Movie not found');
	const isOwner = movie.ownerId === userId;
	return {
		movie: forViewer(movie, userId),
		isOwner,
		userLibraries: isOwner ? userLibraries : [],
		userTags: isOwner ? userTags : [],
		hasAiKey: isOwner && hasAiKey
	};
};

function optionalText(data: FormData, name: string, max: number): string | null {
	const value = (data.get(name) as string | null)?.trim() ?? '';
	return value ? value.slice(0, max) : null;
}

export const actions = {
	// Formato, edición, notas y disponibilidad
	update: async ({ locals, params, request }: RequestEvent) => {
		const data = await request.formData();
		const format = data.get('format');
		if (!isMediaFormat(format)) return fail(400, { error: 'Unknown format.' });

		await updateUserMovie(locals.user!.id, params.id!, {
			format,
			edition: optionalText(data, 'edition', 200),
			notes: optionalText(data, 'notes', 1000),
			isAvailable: data.get('isAvailable') === 'true'
		});
		return { success: true };
	},

	moveLibrary: async ({ locals, params, request }: RequestEvent) => {
		const libraryId = ((await request.formData()).get('libraryId') as string | null)?.trim();
		if (!libraryId) return fail(400, { error: 'Choose a library.' });
		try {
			await updateUserMovie(locals.user!.id, params.id!, { libraryId });
		} catch {
			return fail(404, { error: 'Library not found.' });
		}
		return { moved: true };
	},

	// Portada propia (URL https) o, vacía, volver al póster de TMDB
	setCover: async ({ locals, params, request }: RequestEvent) => {
		const raw = ((await request.formData()).get('coverUrl') as string | null)?.trim() ?? '';
		if (raw) {
			let url: URL;
			try {
				url = new URL(raw);
			} catch {
				return fail(400, { error: 'That isn’t a valid URL.' });
			}
			if (url.protocol !== 'https:' || raw.length > 2000) {
				return fail(400, { error: 'The cover URL must start with https://' });
			}
		}
		await updateUserMovie(locals.user!.id, params.id!, { coverUrl: raw || null });
		return { coverSaved: true };
	},

	// ── Etiquetas (TagCombobox manda name/color o tagId) ────────────────────
	createTag: async ({ locals, params, request }: RequestEvent) => {
		const data = await request.formData();
		const name = (data.get('name') as string | null)?.trim();
		if (!name) return fail(400, { error: 'Name is required' });
		const color = (data.get('color') as string | null)?.trim() || null;
		return tagAction(() => applyMovieTags(locals.user!.id, params.id!, [], [{ name, color }]));
	},

	addTag: async ({ locals, params, request }: RequestEvent) => {
		const tagId = (await request.formData()).get('tagId') as string | null;
		if (!tagId) return fail(400, { error: 'tagId is required' });
		return tagAction(() => applyMovieTags(locals.user!.id, params.id!, [tagId]));
	},

	// Etiquetas sugeridas por la IA: existentes (tagId) y nuevas (newTag)
	applyTags: async ({ locals, params, request }: RequestEvent) => {
		const data = await request.formData();
		const tagIds = data.getAll('tagId').map(String).filter(Boolean);
		const newTags = data
			.getAll('newTag')
			.map((n) => ({ name: String(n) }))
			.filter((t) => t.name.trim());
		if (tagIds.length === 0 && newTags.length === 0)
			return fail(400, { error: 'No tags to apply.' });
		return tagAction(() => applyMovieTags(locals.user!.id, params.id!, tagIds, newTags));
	},

	removeTag: async ({ locals, params, request }: RequestEvent) => {
		const tagId = (await request.formData()).get('tagId') as string | null;
		if (!tagId) return fail(400, { error: 'tagId is required' });
		return tagAction(() => removeMovieTag(locals.user!.id, params.id!, tagId));
	},

	remove: async ({ locals, params }: RequestEvent) => {
		await removeMovie(locals.user!.id, params.id!);
		redirect(303, '/movies');
	}
};

async function tagAction(run: () => Promise<unknown>) {
	try {
		await run();
	} catch (e) {
		if (e instanceof Error && e.message === 'Movie not found.')
			return fail(404, { error: e.message });
		throw e;
	}
	return { tagsUpdated: true };
}
