import { json, error, isHttpError } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import * as v from 'valibot';
import {
	MEDIA_FORMATS,
	addMovieToLibrary,
	findDuplicateUserMovie,
	upsertMovie
} from '$lib/server/movies';
import { getMovie, parseMovieId } from '$lib/server/tmdb';

const text = (max: number) => v.optional(v.pipe(v.string(), v.trim(), v.maxLength(max)));

const AddMovieSchema = v.pipe(
	v.object({
		// Ruta TMDB: "tmdb-<id>", tal como lo devuelve /api/movies/search
		movieId: v.optional(v.pipe(v.string(), v.trim(), v.regex(/^tmdb-\d{1,10}$/))),
		// Ruta manual
		title: text(500),
		originalTitle: text(500),
		directors: v.optional(v.array(v.pipe(v.string(), v.trim(), v.maxLength(200)))),
		releaseYear: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1800), v.maxValue(2999))),
		overview: text(5000),
		// Comunes a la copia
		format: v.picklist(MEDIA_FORMATS),
		edition: text(200),
		coverUrl: v.optional(
			v.pipe(v.string(), v.trim(), v.maxLength(2000), v.url(), v.startsWith('https://'))
		),
		notes: text(1000),
		libraryId: text(64),
		allowDuplicate: v.optional(v.boolean())
	}),
	v.check(({ movieId, title }) => Boolean(movieId || title), 'A movieId or a title is required.')
);

// POST /api/movies — añade una copia a la videoteca del usuario.
// Si ya tiene esa película en ese mismo formato responde 409 con { match }, y
// el cliente puede repetir con allowDuplicate: true.
export async function POST({ locals, request }: RequestEvent) {
	if (!locals.user) error(401, 'Not authenticated');
	const userId = locals.user.id;

	const raw = await request.json().catch(() => null);
	if (!raw || typeof raw !== 'object') error(400, 'Invalid JSON body.');

	const result = v.safeParse(AddMovieSchema, raw);
	if (!result.success) error(400, result.issues[0].message);
	const body = result.output;

	try {
		const copy = {
			format: body.format,
			edition: body.edition,
			coverUrl: body.coverUrl,
			notes: body.notes,
			libraryId: body.libraryId
		};

		if (body.movieId) {
			const tmdbId = parseMovieId(body.movieId)!;
			if (!body.allowDuplicate) {
				const match = await findDuplicateUserMovie(userId, {
					movieId: body.movieId,
					format: body.format
				});
				if (match) return json({ match }, { status: 409 });
			}

			const movie = await getMovie(tmdbId);
			if (!movie) error(404, 'Movie not found on TMDB');
			const movieId = await upsertMovie(movie);
			const userMovieId = await addMovieToLibrary(userId, { movieId }, copy);
			return json({ userMovieId, movieId, title: movie.title }, { status: 201 });
		}

		const title = body.title!;
		if (!body.allowDuplicate) {
			const match = await findDuplicateUserMovie(userId, {
				title,
				releaseYear: body.releaseYear,
				format: body.format
			});
			if (match) return json({ match }, { status: 409 });
		}

		const userMovieId = await addMovieToLibrary(
			userId,
			{
				movieId: null,
				title,
				originalTitle: body.originalTitle || undefined,
				directors: body.directors?.filter(Boolean),
				releaseYear: body.releaseYear,
				overview: body.overview || undefined
			},
			copy
		);
		return json({ userMovieId, movieId: null, title }, { status: 201 });
	} catch (e) {
		if (isHttpError(e)) throw e;
		if (e instanceof Error && e.message === 'Library not found.') error(404, e.message);

		console.error('POST /api/movies failed', e);
		error(500, 'Unexpected error');
	}
}
