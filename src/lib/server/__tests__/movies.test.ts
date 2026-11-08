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
	removeMovie
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
});
