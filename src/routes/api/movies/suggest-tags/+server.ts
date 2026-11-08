import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import * as v from 'valibot';
import { eq } from 'drizzle-orm';
import { getOpenRouterApiKey } from '$lib/server/openrouterKey';
import { suggestTagsForBook, type TagSuggestionInput } from '$lib/server/openrouterTags';
import { getUserMovie } from '$lib/server/movies';
import { getMovie, parseMovieId } from '$lib/server/tmdb';
import { withRLS } from '$lib/server/db/rls';
import { tags } from '$lib/server/db/schema';

const text = (max: number) => v.pipe(v.string(), v.trim(), v.maxLength(max));

const SuggestSchema = v.union([
	// Ya en la videoteca
	v.object({ userMovieId: v.pipe(text(100), v.minLength(1)) }),
	// Elegida en TMDB, aún sin añadir
	v.object({ movieId: v.pipe(v.string(), v.regex(/^tmdb-\d{1,10}$/)) }),
	// Alta manual
	v.object({
		title: v.pipe(text(500), v.minLength(1)),
		directors: v.optional(v.array(text(200)), []),
		overview: v.optional(v.nullable(text(10000)))
	})
]);

// POST /api/movies/suggest-tags — etiquetas para una película: de entre las
// que el usuario ya tiene (tagIds) y unas pocas nuevas (newTags). Las mismas
// etiquetas que los libros. Sin clave de OpenRouter no sugiere nada.
export async function POST({ locals, request }: RequestEvent) {
	if (!locals.user) error(401, 'Not authenticated');
	const userId = locals.user.id;

	const raw = await request.json().catch(() => null);
	const result = v.safeParse(SuggestSchema, raw);
	if (!result.success) error(400, result.issues[0].message);
	const body = result.output;

	const apiKey = await getOpenRouterApiKey(userId);
	if (!apiKey) return json({ tagIds: [], newTags: [] });

	let movie: TagSuggestionInput;
	if ('userMovieId' in body) {
		const own = await getUserMovie(userId, body.userMovieId);
		if (!own || own.ownerId !== userId) error(404, 'Movie not found');
		movie = {
			kind: 'movie',
			title: own.title,
			authors: own.directors,
			description: own.overview,
			subjects: own.genres
		};
	} else if ('movieId' in body) {
		const tmdb = await getMovie(parseMovieId(body.movieId)!);
		if (!tmdb) error(404, 'Movie not found on TMDB');
		movie = {
			kind: 'movie',
			title: tmdb.title,
			authors: tmdb.directors,
			description: tmdb.overview,
			subjects: tmdb.genres
		};
	} else {
		movie = {
			kind: 'movie',
			title: body.title,
			authors: body.directors.filter(Boolean),
			description: body.overview
		};
	}

	const userTags = await withRLS(userId, (tx) =>
		tx.select({ id: tags.id, name: tags.name }).from(tags).where(eq(tags.userId, userId))
	);
	const { existing, proposed } = await suggestTagsForBook(
		apiKey,
		movie,
		userTags.map((t) => t.name),
		{ userId, kind: 'movie_tags', subject: movie.title }
	);
	const tagIds = existing
		.map((name) => userTags.find((t) => t.name === name)?.id)
		.filter((id): id is string => Boolean(id));
	return json({ tagIds, newTags: proposed });
}
