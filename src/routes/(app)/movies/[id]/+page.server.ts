import { error, fail, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import {
	getUserMovie,
	updateUserMovie,
	removeMovie,
	applyMovieTags,
	removeMovieTag,
	forViewer,
	OPEN_LOAN_ERROR
} from '$lib/server/movies';
import { withRLS } from '$lib/server/db/rls';
import { hasOpenRouterApiKey } from '$lib/server/openrouterKey';
import { getMovieForBorrow, requestLoan } from '$lib/server/loans';
import { getMovieReviews, upsertMovieReview, deleteMovieReview } from '$lib/server/movieReviews';
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
		// Para «Pedir prestada»: disponibilidad y petición propia abierta
		borrowInfo: isOwner ? null : await getMovieForBorrow(userId, movie.userMovieId),
		// Reseñas: solo de películas del catálogo (TMDB), como los libros
		reviews: movie.movieId ? await getMovieReviews(userId, movie.movieId) : null,
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

	// ── Reseñas (de la película del catálogo, no de esta copia) ────────────
	saveReview: async ({ locals, params, request }: RequestEvent) => {
		const movieId = await reviewableMovieId(locals.user!.id, params.id!);
		if (!movieId) return fail(404, { reviewError: 'Reviews are only for movies from TMDB.' });

		const data = await request.formData();
		const rating = Number(data.get('rating'));
		const body = (data.get('body') as string | null) ?? undefined;
		try {
			await upsertMovieReview(locals.user!.id, movieId, { rating, body });
		} catch (e) {
			return fail(400, { reviewError: e instanceof Error ? e.message : 'Saving error.' });
		}
		return { reviewSaved: true };
	},

	deleteReview: async ({ locals, params }: RequestEvent) => {
		const movieId = await reviewableMovieId(locals.user!.id, params.id!);
		if (!movieId) return fail(404, { reviewError: 'Movie not found.' });
		await deleteMovieReview(locals.user!.id, movieId);
		return { reviewDeleted: true };
	},

	// Pedirla prestada (solo quien no es el dueño)
	request: async ({ locals, params, request }: RequestEvent) => {
		const notes = ((await request.formData()).get('notes') as string | null)?.trim() || undefined;
		let loanId: string;
		try {
			loanId = await requestLoan(
				locals.user!.id,
				{ kind: 'movie', userMovieId: params.id! },
				notes?.slice(0, 1000)
			);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Error sending request.' });
		}
		redirect(302, `/loans/${loanId}`);
	},

	remove: async ({ locals, params }: RequestEvent) => {
		// removeMovie se niega si hay un préstamo en curso; los terminados quedan
		// en el historial con su foto fija (loans.item_*).
		try {
			await removeMovie(locals.user!.id, params.id!);
		} catch (e) {
			if (e instanceof Error && e.message === OPEN_LOAN_ERROR)
				return fail(400, { error: e.message });
			throw e;
		}
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

// Reseña quien puede ver la copia (suya, por grupo o prestada) y solo si es de TMDB.
async function reviewableMovieId(userId: string, userMovieId: string): Promise<string | null> {
	const movie = await getUserMovie(userId, userMovieId);
	return movie?.movieId ?? null;
}
