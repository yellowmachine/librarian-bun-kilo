import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../db/test-db';

// movieReviews.ts usa withRLS (db/rls): se redirige a una base PGlite en
// memoria por test.
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

import { getMovieReviews, upsertMovieReview, deleteMovieReview } from '../movieReviews';
import { movieReviews } from '../db/schema';

const ALICE = 'user-alice';
const BOB = 'user-bob';
const MOVIE = 'tmdb-78';

beforeEach(async () => {
	holder.tdb = await createTestDb();
	const seed = [
		`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('${ALICE}', 'Alice', 'a@test.com', true, now(), now()), ('${BOB}', 'Bob', 'b@test.com', true, now(), now())`,
		`INSERT INTO movies (id, title) VALUES ('${MOVIE}', 'Blade Runner')`
	];
	await holder.tdb.asSuperuser(async (tx) => {
		for (const stmt of seed) await tx.execute(stmt as string);
	});
});
afterEach(() => holder.tdb.cleanup());

describe('reseñas de películas', () => {
	it('una por persona: guardar otra vez la actualiza', async () => {
		await upsertMovieReview(ALICE, MOVIE, { rating: 3, body: 'Bien' });
		await upsertMovieReview(ALICE, MOVIE, { rating: 5, body: '  Obra maestra  ' });
		await upsertMovieReview(BOB, MOVIE, { rating: 4 });

		const asAlice = await getMovieReviews(ALICE, MOVIE);
		expect(asAlice.reviews).toHaveLength(2);
		expect(asAlice.myReview).toMatchObject({ rating: 5, body: 'Obra maestra', userName: 'Alice' });
		expect(asAlice.stats).toEqual({ averageRating: 4.5, totalReviews: 2 });

		const asBob = await getMovieReviews(BOB, MOVIE);
		expect(asBob.myReview).toMatchObject({ rating: 4, body: null });
	});

	it('solo se borra la propia', async () => {
		await upsertMovieReview(ALICE, MOVIE, { rating: 3 });
		await upsertMovieReview(BOB, MOVIE, { rating: 4 });

		await deleteMovieReview(ALICE, MOVIE);
		const { reviews } = await getMovieReviews(BOB, MOVIE);
		expect(reviews.map((r) => r.userId)).toEqual([BOB]);
	});

	it('nadie edita ni borra la reseña de otro, ni escribe en su nombre', async () => {
		await upsertMovieReview(BOB, MOVIE, { rating: 4 });
		await holder.tdb.withRLS(ALICE, async (tx) => {
			await tx.update(movieReviews).set({ rating: 1 });
			await tx.delete(movieReviews);
		});
		expect((await getMovieReviews(BOB, MOVIE)).myReview?.rating).toBe(4);

		await expect(
			holder.tdb.withRLS(ALICE, (tx) =>
				tx.insert(movieReviews).values({ id: 'x', movieId: MOVIE, userId: BOB, rating: 1 })
			)
		).rejects.toMatchObject({ cause: { code: '42501' } });
	});

	it('la puntuación va de 1 a 5, también en la base de datos', async () => {
		await expect(upsertMovieReview(ALICE, MOVIE, { rating: 0 })).rejects.toThrow('between 1 and 5');
		await expect(upsertMovieReview(ALICE, MOVIE, { rating: 6 })).rejects.toThrow('between 1 and 5');
		await expect(
			holder.tdb.asSuperuser((tx) =>
				tx.insert(movieReviews).values({ id: 'x', movieId: MOVIE, userId: ALICE, rating: 9 })
			)
		).rejects.toMatchObject({ cause: { code: '23514' } });
	});
});
