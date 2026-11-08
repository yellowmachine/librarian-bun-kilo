// Videoteca: películas del catálogo (movies, desde TMDB) y copias físicas de
// cada usuario (user_movies). Mismo patrón que books.ts: los campos de la
// copia tapan los del catálogo (COALESCE), y en las altas manuales son los
// únicos que hay.
import { nanoid } from 'nanoid';
import { eq, and, ne, desc, inArray, sql } from 'drizzle-orm';
import { db } from './db/index';
import {
	movies,
	userMovies,
	libraries,
	movieCoverPhotos,
	tags,
	userMovieTags,
	user,
	loans
} from './db/schema';
import { withRLS } from './db/rls';
import { getOrCreateDefaultLibrary } from './libraries';
import type { TmdbMovie } from './tmdb';
import type { DecodedImage } from './imageData';
import type { MediaFormat } from '$lib/mediaFormat';

export { MEDIA_FORMATS, type MediaFormat } from '$lib/mediaFormat';

// ─── COALESCE helpers ─────────────────────────────────────────────────────────

const effectiveTitle = sql<string>`COALESCE(${userMovies.title}, ${movies.title})`;
const effectiveOriginalTitle = sql<
	string | null
>`COALESCE(${userMovies.originalTitle}, ${movies.originalTitle})`;
const effectiveDirectors = sql<
	string[] | null
>`COALESCE(${userMovies.directors}, ${movies.directors})`;
const effectiveReleaseYear = sql<
	number | null
>`COALESCE(${userMovies.releaseYear}, ${movies.releaseYear})`;
const effectiveOverview = sql<string | null>`COALESCE(${userMovies.overview}, ${movies.overview})`;
const effectiveCoverUrl = sql<string | null>`COALESCE(${userMovies.coverUrl}, ${movies.posterUrl})`;

// ─── Upsert en el catálogo global ─────────────────────────────────────────────
// Sin RLS (catálogo global). Si ya existe no se toca: la ficha de TMDB de una
// película cambia poco y no merece una escritura en cada alta.

export async function upsertMovie(data: TmdbMovie): Promise<string> {
	await db
		.insert(movies)
		.values({
			id: data.id,
			title: data.title,
			originalTitle: data.originalTitle,
			releaseYear: data.releaseYear,
			directors: data.directors,
			runtime: data.runtime,
			genres: data.genres,
			overview: data.overview,
			posterUrl: data.posterUrl,
			tmdbData: data.tmdbData
		})
		.onConflictDoNothing({ target: movies.id });
	return data.id;
}

// ─── Biblioteca destino ───────────────────────────────────────────────────────
// La RLS de user_movies solo valida userId, no libraryId: hay que comprobar a
// mano que la biblioteca es del usuario.

async function resolveLibraryId(
	tx: typeof db,
	userId: string,
	libraryId: string | undefined
): Promise<string> {
	if (!libraryId) return getOrCreateDefaultLibrary(userId, tx);
	const target = await tx
		.select({ id: libraries.id })
		.from(libraries)
		.where(and(eq(libraries.id, libraryId), eq(libraries.userId, userId)));
	if (target.length === 0) throw new Error('Library not found.');
	return libraryId;
}

// ─── Añadir a la videoteca ────────────────────────────────────────────────────

export type MovieSource =
	| { movieId: string }
	| {
			movieId: null;
			title: string;
			originalTitle?: string;
			directors?: string[];
			releaseYear?: number;
			overview?: string;
	  };

export type CopyDetails = {
	format: MediaFormat;
	edition?: string;
	coverUrl?: string;
	notes?: string;
	libraryId?: string;
};

/**
 * Siempre crea una copia nueva: tener la misma película en varios formatos (o
 * dos copias) es normal. El aviso de duplicado lo da antes findDuplicateUserMovie.
 */
export async function addMovieToLibrary(
	userId: string,
	source: MovieSource,
	copy: CopyDetails
): Promise<string> {
	return withRLS(userId, async (tx) => {
		const libraryId = await resolveLibraryId(tx, userId, copy.libraryId);
		const manual = source.movieId === null ? source : null;

		const id = nanoid();
		await tx.insert(userMovies).values({
			id,
			userId,
			libraryId,
			movieId: source.movieId,
			title: manual?.title ?? null,
			originalTitle: manual?.originalTitle ?? null,
			directors: manual?.directors ?? null,
			releaseYear: manual?.releaseYear ?? null,
			overview: manual?.overview ?? null,
			coverUrl: copy.coverUrl ?? null,
			format: copy.format,
			edition: copy.edition || null,
			notes: copy.notes || null,
			isAvailable: true
		});
		return id;
	});
}

// ─── Listar / leer ────────────────────────────────────────────────────────────

export type UserMovieWithDetails = {
	userMovieId: string;
	ownerId: string;
	libraryId: string;
	movieId: string | null;
	title: string;
	originalTitle: string | null;
	directors: string[];
	releaseYear: number | null;
	runtime: number | null;
	genres: string[];
	overview: string | null;
	coverUrl: string | null;
	format: MediaFormat;
	edition: string | null;
	isAvailable: boolean;
	notes: string | null;
	addedAt: Date;
	tags: MovieTag[];
};

export type MovieTag = { id: string; name: string; color: string | null };

export type MovieFilter = { type: 'all' } | { type: 'library'; libraryId: string };

const movieColumns = {
	userMovieId: userMovies.id,
	ownerId: userMovies.userId,
	libraryId: userMovies.libraryId,
	movieId: userMovies.movieId,
	title: effectiveTitle,
	originalTitle: effectiveOriginalTitle,
	directors: effectiveDirectors,
	releaseYear: effectiveReleaseYear,
	runtime: movies.runtime,
	genres: movies.genres,
	overview: effectiveOverview,
	coverUrl: effectiveCoverUrl,
	format: userMovies.format,
	edition: userMovies.edition,
	isAvailable: userMovies.isAvailable,
	notes: userMovies.notes,
	addedAt: userMovies.addedAt
};

type MovieRow = Omit<UserMovieWithDetails, 'directors' | 'genres' | 'tags'> & {
	directors: string[] | null;
	genres: string[] | null;
};

function withArrays<T extends MovieRow>(row: T): T & { directors: string[]; genres: string[] } {
	return { ...row, directors: row.directors ?? [], genres: row.genres ?? [] };
}

export async function getUserMovies(
	userId: string,
	filter: MovieFilter = { type: 'all' }
): Promise<UserMovieWithDetails[]> {
	return withRLS(userId, async (tx) => {
		const where =
			filter.type === 'library'
				? and(eq(userMovies.userId, userId), eq(userMovies.libraryId, filter.libraryId))
				: eq(userMovies.userId, userId);

		const rows = await tx
			.select(movieColumns)
			.from(userMovies)
			.leftJoin(movies, eq(userMovies.movieId, movies.id))
			.where(where)
			.orderBy(sql`lower(COALESCE(${userMovies.title}, ${movies.title})) ASC`, userMovies.addedAt);

		const tagsByMovie = await loadTags(
			tx,
			rows.map((r) => r.userMovieId)
		);
		return rows.map((row) => ({
			...withArrays(row),
			tags: tagsByMovie.get(row.userMovieId) ?? []
		}));
	});
}

// Etiquetas de varias copias en una consulta. La RLS de user_movie_tags ya
// filtra: el dueño ve todas las suyas; un miembro de grupo, solo las compartidas.
async function loadTags(tx: typeof db, userMovieIds: string[]): Promise<Map<string, MovieTag[]>> {
	const byMovie = new Map<string, MovieTag[]>();
	if (userMovieIds.length === 0) return byMovie;
	const rows = await tx
		.select({
			userMovieId: userMovieTags.userMovieId,
			id: tags.id,
			name: tags.name,
			color: tags.color
		})
		.from(userMovieTags)
		.innerJoin(tags, eq(userMovieTags.tagId, tags.id))
		.where(inArray(userMovieTags.userMovieId, userMovieIds))
		.orderBy(tags.name);
	for (const { userMovieId, ...tag } of rows) {
		const list = byMovie.get(userMovieId) ?? [];
		list.push(tag);
		byMovie.set(userMovieId, list);
	}
	return byMovie;
}

export async function getUserMovie(
	userId: string,
	userMovieId: string
): Promise<(UserMovieWithDetails & { coverOverridden: boolean; ownerName: string }) | null> {
	return withRLS(userId, async (tx) => {
		const rows = await tx
			.select({
				...movieColumns,
				// La copia lleva portada propia que tapa el póster del catálogo: la
				// ficha lo usa para ofrecer "volver al póster de TMDB".
				coverOverridden: sql<boolean>`(${userMovies.coverUrl} IS NOT NULL)`,
				ownerName: user.name
			})
			.from(userMovies)
			.leftJoin(movies, eq(userMovies.movieId, movies.id))
			.innerJoin(user, eq(userMovies.userId, user.id))
			.where(eq(userMovies.id, userMovieId));

		if (rows.length === 0) return null;
		const tagsByMovie = await loadTags(tx, [userMovieId]);
		return { ...withArrays(rows[0]), tags: tagsByMovie.get(userMovieId) ?? [] };
	});
}

// ─── Películas de otros ───────────────────────────────────────────────────────
// Las que la RLS deja ver de otros usuarios: las que llevan una etiqueta
// compartida con algún grupo del usuario. Sus etiquetas, igual: solo las
// compartidas. Las notas y la biblioteca son del dueño y no salen.

export type OthersMovie = UserMovieWithDetails & { ownerName: string };

function withoutPrivate<T extends UserMovieWithDetails>(movie: T): T {
	return { ...movie, notes: null, libraryId: '' };
}

async function visibleMovies(
	userId: string,
	opts: { excludeOwn: boolean; order: 'title' | 'recent'; limit: number }
): Promise<OthersMovie[]> {
	return withRLS(userId, async (tx) => {
		const rows = await tx
			.select({ ...movieColumns, ownerName: user.name })
			.from(userMovies)
			.leftJoin(movies, eq(userMovies.movieId, movies.id))
			.innerJoin(user, eq(userMovies.userId, user.id))
			.where(opts.excludeOwn ? ne(userMovies.userId, userId) : undefined)
			.orderBy(
				opts.order === 'recent'
					? desc(userMovies.addedAt)
					: sql`lower(COALESCE(${userMovies.title}, ${movies.title})) ASC`
			)
			.limit(opts.limit);

		const tagsByMovie = await loadTags(
			tx,
			rows.map((r) => r.userMovieId)
		);
		return rows.map((row) => {
			const movie = { ...withArrays(row), tags: tagsByMovie.get(row.userMovieId) ?? [] };
			return row.ownerId === userId ? movie : withoutPrivate(movie);
		});
	});
}

/** Películas de otros visibles por grupo, por título. */
export function getMoviesFromOthers(userId: string, limit = 500): Promise<OthersMovie[]> {
	return visibleMovies(userId, { excludeOwn: true, order: 'title', limit });
}

/** Últimas películas añadidas que el usuario puede ver (como getGroupRecentBooks). */
export function getRecentVisibleMovies(userId: string, limit = 50): Promise<OthersMovie[]> {
	return visibleMovies(userId, { excludeOwn: false, order: 'recent', limit });
}

/** Para la ficha: lo que ve quien no es el dueño, sin lo privado. */
export function forViewer<T extends UserMovieWithDetails>(movie: T, viewerId: string): T {
	return movie.ownerId === viewerId ? movie : withoutPrivate(movie);
}

// ─── Duplicados ───────────────────────────────────────────────────────────────
// Solo cuenta como duplicado la misma película EN EL MISMO FORMATO: tenerla en
// DVD y en Blu-ray es justo lo que hace un coleccionista.

function normalizeText(s: string): string {
	return s
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim();
}

export type MovieDuplicateMatch = {
	userMovieId: string;
	title: string;
	format: MediaFormat;
	edition: string | null;
	coverUrl: string | null;
	libraryId: string;
};

export async function findDuplicateUserMovie(
	userId: string,
	criteria: { movieId?: string; title?: string; releaseYear?: number; format: MediaFormat }
): Promise<MovieDuplicateMatch | null> {
	const { movieId, title, releaseYear, format } = criteria;
	if (!movieId && !title) return null;

	const candidates = (await getUserMovies(userId)).filter((c) => c.format === format);
	const normalizedTitle = title ? normalizeText(title) : '';

	const match = candidates.find((c) => {
		if (movieId) return c.movieId === movieId;
		const sameTitle =
			normalizeText(c.title) === normalizedTitle ||
			(c.originalTitle !== null && normalizeText(c.originalTitle) === normalizedTitle);
		// Si los dos tienen año y no coincide, son películas distintas (remakes).
		const sameYear = !releaseYear || !c.releaseYear || c.releaseYear === releaseYear;
		return sameTitle && sameYear;
	});

	return match
		? {
				userMovieId: match.userMovieId,
				title: match.title,
				format: match.format,
				edition: match.edition,
				coverUrl: match.coverUrl,
				libraryId: match.libraryId
			}
		: null;
}

// ─── Actualizar / eliminar ────────────────────────────────────────────────────

export type UserMovieUpdate = {
	format?: MediaFormat;
	edition?: string | null;
	notes?: string | null;
	isAvailable?: boolean;
	// null vuelve al póster del catálogo
	coverUrl?: string | null;
	libraryId?: string;
};

export async function updateUserMovie(
	userId: string,
	userMovieId: string,
	data: UserMovieUpdate
): Promise<void> {
	await withRLS(userId, async (tx) => {
		const { libraryId, ...rest } = data;
		const values: Partial<typeof userMovies.$inferInsert> = { ...rest, updatedAt: new Date() };
		if (libraryId !== undefined) values.libraryId = await resolveLibraryId(tx, userId, libraryId);
		await tx.update(userMovies).set(values).where(eq(userMovies.id, userMovieId));
		// Otra portada (o volver al póster): la foto guardada deja de usarse.
		if (data.coverUrl !== undefined) {
			await tx.delete(movieCoverPhotos).where(eq(movieCoverPhotos.userMovieId, userMovieId));
		}
	});
}

// ─── Foto propia de la carátula ───────────────────────────────────────────────

export function coverPhotoUrl(userMovieId: string): string {
	// El parámetro cambia con cada foto nueva, así el navegador (que la cachea
	// como inmutable) nunca enseña la anterior.
	return `/api/movies/${userMovieId}/cover?v=${nanoid(8)}`;
}

/** Guarda (o reemplaza) la foto y la pone de portada. false si la copia no es del usuario. */
export async function saveCoverPhoto(
	userId: string,
	userMovieId: string,
	image: DecodedImage
): Promise<boolean> {
	return withRLS(userId, async (tx) => {
		const updated = await tx
			.update(userMovies)
			.set({ coverUrl: coverPhotoUrl(userMovieId), updatedAt: new Date() })
			.where(and(eq(userMovies.id, userMovieId), eq(userMovies.userId, userId)))
			.returning({ id: userMovies.id });
		if (updated.length === 0) return false;

		await tx
			.insert(movieCoverPhotos)
			.values({ userMovieId, userId, contentType: image.contentType, data: image.bytes })
			.onConflictDoUpdate({
				target: movieCoverPhotos.userMovieId,
				set: { contentType: image.contentType, data: image.bytes, createdAt: new Date() }
			});
		return true;
	});
}

export async function getCoverPhoto(
	userId: string,
	userMovieId: string
): Promise<{ contentType: string; data: Uint8Array } | null> {
	return withRLS(userId, async (tx) => {
		const rows = await tx
			.select({ contentType: movieCoverPhotos.contentType, data: movieCoverPhotos.data })
			.from(movieCoverPhotos)
			.where(eq(movieCoverPhotos.userMovieId, userMovieId));
		return rows[0] ?? null;
	});
}

export const OPEN_LOAN_ERROR = 'This movie has a loan in progress.';

/**
 * No con un préstamo en curso (la FK de loans es SET NULL, así que la base no
 * lo impediría). Los terminados se quedan en el historial con su foto fija.
 */
export async function removeMovie(userId: string, userMovieId: string): Promise<void> {
	await withRLS(userId, async (tx) => {
		const open = await tx
			.select({ id: loans.id })
			.from(loans)
			.where(
				and(
					eq(loans.userMovieId, userMovieId),
					inArray(loans.status, ['requested', 'accepted', 'active', 'return_requested'])
				)
			);
		if (open.length > 0) throw new Error(OPEN_LOAN_ERROR);
		await tx.delete(userMovies).where(eq(userMovies.id, userMovieId));
	});
}

// ─── Etiquetas ────────────────────────────────────────────────────────────────
// Las mismas etiquetas que los libros. Todas las operaciones comprueban que la
// copia es del usuario (además de la RLS, que exige película Y etiqueta propias).

async function assertOwnMovie(tx: typeof db, userId: string, userMovieId: string): Promise<void> {
	const own = await tx
		.select({ id: userMovies.id })
		.from(userMovies)
		.where(and(eq(userMovies.id, userMovieId), eq(userMovies.userId, userId)));
	if (own.length === 0) throw new Error('Movie not found.');
}

/**
 * Asigna etiquetas existentes (tagIds, solo las del usuario) y crea las nuevas
 * (newNames; si ya hay una con ese nombre, sin distinguir mayúsculas, se
 * reutiliza). Devuelve los ids asignados.
 */
export async function applyMovieTags(
	userId: string,
	userMovieId: string,
	tagIds: string[],
	newTags: { name: string; color?: string | null }[] = []
): Promise<string[]> {
	return withRLS(userId, async (tx) => {
		await assertOwnMovie(tx, userId, userMovieId);

		const userTags = await tx
			.select({ id: tags.id, name: tags.name })
			.from(tags)
			.where(eq(tags.userId, userId));
		const ownIds = new Set(userTags.map((t) => t.id));
		const toAssign = new Set(tagIds.filter((id) => ownIds.has(id)));

		for (const { name: raw, color } of newTags) {
			const name = raw.trim().slice(0, 50);
			if (!name) continue;
			const existing = userTags.find((t) => t.name.toLowerCase() === name.toLowerCase());
			if (existing) {
				toAssign.add(existing.id);
				continue;
			}
			const id = nanoid();
			await tx.insert(tags).values({ id, userId, name, color: color ?? null });
			userTags.push({ id, name });
			toAssign.add(id);
		}

		if (toAssign.size > 0) {
			await tx
				.insert(userMovieTags)
				.values([...toAssign].map((tagId) => ({ userMovieId, tagId })))
				.onConflictDoNothing();
		}
		return [...toAssign];
	});
}

export async function removeMovieTag(
	userId: string,
	userMovieId: string,
	tagId: string
): Promise<void> {
	await withRLS(userId, async (tx) => {
		await assertOwnMovie(tx, userId, userMovieId);
		await tx
			.delete(userMovieTags)
			.where(and(eq(userMovieTags.userMovieId, userMovieId), eq(userMovieTags.tagId, tagId)));
	});
}
