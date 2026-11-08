import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../db/test-db';

// movies.ts y libraries.ts usan la conexión real (db/index) y withRLS
// (db/rls): se redirigen a una base PGlite en memoria por test.
const holder = vi.hoisted(() => ({ tdb: null as unknown as TestDb }));
vi.mock('../db/index', () => ({
	get db() {
		return holder.tdb.db;
	}
}));
vi.mock('../db/rls', () => ({
	withRLS: (userId: string, cb: (tx: unknown) => Promise<unknown>) =>
		holder.tdb.withRLS(userId, cb as never)
}));

import {
	upsertMovie,
	addMovieToLibrary,
	getUserMovies,
	getUserMovie,
	findDuplicateUserMovie,
	updateUserMovie,
	removeMovie,
	saveCoverPhoto,
	getCoverPhoto,
	applyMovieTags,
	removeMovieTag
} from '../movies';
import { deleteLibrary, createLibrary } from '../libraries';
import type { TmdbMovie } from '../tmdb';

const ALICE = 'user-alice';
const BOB = 'user-bob';

const BLADE_RUNNER: TmdbMovie = {
	id: 'tmdb-78',
	title: 'Blade Runner',
	originalTitle: null,
	releaseYear: 1982,
	directors: ['Ridley Scott'],
	runtime: 117,
	genres: ['Ciencia ficción'],
	overview: 'Los Ángeles, 2019.',
	posterUrl: 'https://image.tmdb.org/t/p/w500/abc.jpg',
	tmdbData: '{}'
};

beforeEach(async () => {
	holder.tdb = await createTestDb();
	await holder.tdb.asSuperuser((tx) =>
		tx.execute(
			`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES
				('${ALICE}', 'Alice', 'alice@test.com', true, now(), now()),
				('${BOB}', 'Bob', 'bob@test.com', true, now(), now())` as string
		)
	);
});
afterEach(() => holder.tdb.cleanup());

describe('videoteca', () => {
	it('añade una película de TMDB a la biblioteca por defecto y la lee con los datos del catálogo', async () => {
		const movieId = await upsertMovie(BLADE_RUNNER);
		await upsertMovie(BLADE_RUNNER); // idempotente
		const id = await addMovieToLibrary(ALICE, { movieId }, { format: 'bluray' });

		const movie = await getUserMovie(ALICE, id);
		expect(movie).toMatchObject({
			title: 'Blade Runner',
			directors: ['Ridley Scott'],
			releaseYear: 1982,
			runtime: 117,
			format: 'bluray',
			coverUrl: BLADE_RUNNER.posterUrl,
			coverOverridden: false
		});
		expect(await getUserMovie(BOB, id)).toBeNull();
	});

	it('alta manual y portada propia que tapa el póster', async () => {
		const manual = await addMovieToLibrary(
			ALICE,
			{ movieId: null, title: 'Vídeo de la boda', releaseYear: 2010 },
			{ format: 'dvd', edition: 'Casera' }
		);
		const movieId = await upsertMovie(BLADE_RUNNER);
		const tmdb = await addMovieToLibrary(
			ALICE,
			{ movieId },
			{ format: 'uhd_bluray', coverUrl: 'https://example.com/steelbook.jpg' }
		);

		const list = await getUserMovies(ALICE);
		expect(list.map((m) => m.title)).toEqual(['Blade Runner', 'Vídeo de la boda']);
		expect(list.find((m) => m.userMovieId === manual)).toMatchObject({
			directors: [],
			genres: [],
			edition: 'Casera'
		});

		const withOwnCover = await getUserMovie(ALICE, tmdb);
		expect(withOwnCover?.coverUrl).toBe('https://example.com/steelbook.jpg');
		expect(withOwnCover?.coverOverridden).toBe(true);

		await updateUserMovie(ALICE, tmdb, { coverUrl: null, notes: 'Prestada a Bob' });
		const reset = await getUserMovie(ALICE, tmdb);
		expect(reset?.coverUrl).toBe(BLADE_RUNNER.posterUrl);
		expect(reset?.notes).toBe('Prestada a Bob');
	});

	it('solo es duplicado la misma película en el mismo formato', async () => {
		const movieId = await upsertMovie(BLADE_RUNNER);
		await addMovieToLibrary(ALICE, { movieId }, { format: 'bluray' });
		await addMovieToLibrary(
			ALICE,
			{ movieId: null, title: 'Alien', releaseYear: 1979 },
			{ format: 'dvd' }
		);

		expect(await findDuplicateUserMovie(ALICE, { movieId, format: 'bluray' })).not.toBeNull();
		expect(await findDuplicateUserMovie(ALICE, { movieId, format: 'dvd' })).toBeNull();
		expect(await findDuplicateUserMovie(BOB, { movieId, format: 'bluray' })).toBeNull();

		expect(await findDuplicateUserMovie(ALICE, { title: 'ALIEN', format: 'dvd' })).not.toBeNull();
		// Mismo título, otro año: un remake
		expect(
			await findDuplicateUserMovie(ALICE, { title: 'Alien', releaseYear: 2027, format: 'dvd' })
		).toBeNull();
	});

	it('no deja usar ni mover a una biblioteca ajena', async () => {
		const bobLibrary = await createLibrary(BOB, 'Casa de Bob');
		await expect(
			addMovieToLibrary(
				ALICE,
				{ movieId: null, title: 'X' },
				{ format: 'dvd', libraryId: bobLibrary }
			)
		).rejects.toThrow('Library not found.');

		const id = await addMovieToLibrary(ALICE, { movieId: null, title: 'X' }, { format: 'dvd' });
		await expect(updateUserMovie(ALICE, id, { libraryId: bobLibrary })).rejects.toThrow(
			'Library not found.'
		);
	});

	it('no se borra una biblioteca con películas', async () => {
		const office = await createLibrary(ALICE, 'Oficina');
		const id = await addMovieToLibrary(
			ALICE,
			{ movieId: null, title: 'X' },
			{ format: 'dvd', libraryId: office }
		);
		await expect(deleteLibrary(ALICE, office)).rejects.toThrow('movies');

		await removeMovie(ALICE, id);
		await deleteLibrary(ALICE, office);
		expect(await getUserMovies(ALICE)).toEqual([]);
	});

	it('guarda la foto propia de la carátula y la retira al volver al póster', async () => {
		const movieId = await upsertMovie(BLADE_RUNNER);
		const id = await addMovieToLibrary(ALICE, { movieId }, { format: 'bluray' });
		const image = {
			contentType: 'image/jpeg' as const,
			bytes: Uint8Array.from([0xff, 0xd8, 0xff, 1])
		};

		expect(await saveCoverPhoto(BOB, id, image)).toBe(false);
		expect(await saveCoverPhoto(ALICE, id, image)).toBe(true);

		const withPhoto = await getUserMovie(ALICE, id);
		expect(withPhoto?.coverUrl).toMatch(new RegExp(`^/api/movies/${id}/cover\\?v=`));
		expect(withPhoto?.coverOverridden).toBe(true);

		const photo = await getCoverPhoto(ALICE, id);
		expect(photo?.contentType).toBe('image/jpeg');
		expect(Array.from(photo!.data)).toEqual([0xff, 0xd8, 0xff, 1]);
		expect(await getCoverPhoto(BOB, id)).toBeNull();

		// Una foto nueva reemplaza a la anterior y cambia la URL
		await saveCoverPhoto(ALICE, id, { ...image, bytes: Uint8Array.from([0xff, 0xd8, 0xff, 2]) });
		expect((await getUserMovie(ALICE, id))?.coverUrl).not.toBe(withPhoto?.coverUrl);
		expect(Array.from((await getCoverPhoto(ALICE, id))!.data)).toEqual([0xff, 0xd8, 0xff, 2]);

		await updateUserMovie(ALICE, id, { coverUrl: null });
		expect(await getCoverPhoto(ALICE, id)).toBeNull();
		expect((await getUserMovie(ALICE, id))?.coverUrl).toBe(BLADE_RUNNER.posterUrl);
	});

	it('borrar la película borra su foto', async () => {
		const id = await addMovieToLibrary(ALICE, { movieId: null, title: 'X' }, { format: 'dvd' });
		await saveCoverPhoto(ALICE, id, {
			contentType: 'image/png',
			bytes: Uint8Array.from([0x89, 0x50])
		});
		await removeMovie(ALICE, id);
		expect(await getCoverPhoto(ALICE, id)).toBeNull();
	});

	it('etiqueta con existentes y nuevas, reutilizando por nombre y sin tocar etiquetas ajenas', async () => {
		const id = await addMovieToLibrary(ALICE, { movieId: null, title: 'Alien' }, { format: 'dvd' });
		await holder.tdb.asSuperuser((tx) =>
			tx.execute(
				`INSERT INTO tags (id, user_id, name) VALUES
					('t-terror', '${ALICE}', 'Terror'),
					('t-bob', '${BOB}', 'De Bob')` as string
			)
		);

		const assigned = await applyMovieTags(
			ALICE,
			id,
			['t-terror', 't-bob'],
			[
				{ name: 'terror' }, // ya existe (otra caja): se reutiliza
				{ name: 'Ciencia ficción', color: '#123456' }
			]
		);
		expect(assigned).toHaveLength(2);
		expect(assigned).not.toContain('t-bob');

		const movie = await getUserMovie(ALICE, id);
		expect(movie?.tags.map((t) => t.name)).toEqual(['Ciencia ficción', 'Terror']);
		expect((await getUserMovies(ALICE))[0].tags).toHaveLength(2);

		await removeMovieTag(ALICE, id, 't-terror');
		expect((await getUserMovie(ALICE, id))?.tags.map((t) => t.name)).toEqual(['Ciencia ficción']);
	});

	it('no deja etiquetar ni desetiquetar una película ajena', async () => {
		const id = await addMovieToLibrary(BOB, { movieId: null, title: 'De Bob' }, { format: 'dvd' });
		await expect(applyMovieTags(ALICE, id, [], [{ name: 'Mía' }])).rejects.toThrow(
			'Movie not found.'
		);
		await expect(removeMovieTag(ALICE, id, 'x')).rejects.toThrow('Movie not found.');
	});
});
