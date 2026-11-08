import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../test-db';
import { movies, userMovies, libraries } from '../schema';
import { eq } from 'drizzle-orm';

// ─── Seed helpers ─────────────────────────────────────────────────────────────

const ALICE = 'user-alice';
const BOB = 'user-bob';

async function seedUsers(tdb: TestDb) {
	await tdb.asSuperuser(async (tx) => {
		await tx.execute(
			`
			INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
			VALUES
				('${ALICE}', 'Alice', 'alice@test.com', true, now(), now()),
				('${BOB}',   'Bob',   'bob@test.com',   true, now(), now())
		` as string
		);
	});
}

async function seedLibrary(tdb: TestDb, id: string, userId: string, isDefault = true) {
	await tdb.asSuperuser(async (tx) => {
		await tx.insert(libraries).values({ id, userId, name: id, isDefault });
	});
}

// ─── movies ───────────────────────────────────────────────────────────────────

describe('RLS · movies (catálogo global)', () => {
	let tdb: TestDb;
	beforeEach(async () => {
		tdb = await createTestDb();
		await seedUsers(tdb);
	});
	afterEach(() => tdb.cleanup());

	it('cualquier usuario puede insertar y leer el catálogo', async () => {
		await tdb.withRLS(ALICE, (tx) =>
			tx.insert(movies).values({ id: 'tmdb-78', title: 'Blade Runner', releaseYear: 1982 })
		);
		const rows = await tdb.withRLS(BOB, (tx) => tx.select().from(movies));
		expect(rows).toHaveLength(1);
		expect(rows[0].title).toBe('Blade Runner');
	});
});

// ─── user_movies ──────────────────────────────────────────────────────────────

describe('RLS · user_movies', () => {
	let tdb: TestDb;
	beforeEach(async () => {
		tdb = await createTestDb();
		await seedUsers(tdb);
		await tdb.asSuperuser((tx) =>
			tx.insert(movies).values({ id: 'tmdb-78', title: 'Blade Runner' })
		);
		await seedLibrary(tdb, 'lib-alice', ALICE);
		await seedLibrary(tdb, 'lib-bob', BOB);

		await tdb.asSuperuser((tx) =>
			tx.insert(userMovies).values([
				{
					id: 'um-alice',
					userId: ALICE,
					libraryId: 'lib-alice',
					movieId: 'tmdb-78',
					format: 'bluray'
				},
				{ id: 'um-bob', userId: BOB, libraryId: 'lib-bob', title: 'Home video', format: 'dvd' }
			])
		);
	});
	afterEach(() => tdb.cleanup());

	it('cada usuario solo ve sus propias películas', async () => {
		const alice = await tdb.withRLS(ALICE, (tx) => tx.select().from(userMovies));
		expect(alice.map((r) => r.id)).toEqual(['um-alice']);

		const bob = await tdb.withRLS(BOB, (tx) => tx.select().from(userMovies));
		expect(bob.map((r) => r.id)).toEqual(['um-bob']);
	});

	it('alice no puede insertar una película a nombre de bob', async () => {
		await expect(
			tdb.withRLS(ALICE, (tx) =>
				tx.insert(userMovies).values({
					id: 'um-fraud',
					userId: BOB,
					libraryId: 'lib-bob',
					movieId: 'tmdb-78',
					format: 'dvd'
				})
			)
		).rejects.toThrow();
	});

	it('alice no puede actualizar ni borrar la película de bob', async () => {
		await tdb.withRLS(ALICE, async (tx) => {
			await tx.update(userMovies).set({ notes: 'mía' }).where(eq(userMovies.id, 'um-bob'));
			await tx.delete(userMovies).where(eq(userMovies.id, 'um-bob'));
		});
		const rows = await tdb.asSuperuser((tx) =>
			tx.select().from(userMovies).where(eq(userMovies.id, 'um-bob'))
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].notes).toBeNull();
	});

	it('la misma película puede estar en varios formatos', async () => {
		await tdb.withRLS(ALICE, (tx) =>
			tx.insert(userMovies).values({
				id: 'um-alice-4k',
				userId: ALICE,
				libraryId: 'lib-alice',
				movieId: 'tmdb-78',
				format: 'uhd_bluray',
				edition: 'Steelbook'
			})
		);
		const rows = await tdb.withRLS(ALICE, (tx) => tx.select().from(userMovies));
		expect(rows).toHaveLength(2);
	});

	it('exige movieId o título', async () => {
		await expect(
			tdb.withRLS(ALICE, (tx) =>
				tx.insert(userMovies).values({
					id: 'um-empty',
					userId: ALICE,
					libraryId: 'lib-alice',
					format: 'dvd'
				})
			)
		).rejects.toThrow();
	});

	it('no se puede borrar una biblioteca que tiene películas', async () => {
		await seedLibrary(tdb, 'lib-alice-2', ALICE, false);
		await tdb.asSuperuser((tx) =>
			tx.update(userMovies).set({ libraryId: 'lib-alice-2' }).where(eq(userMovies.id, 'um-alice'))
		);
		await expect(
			tdb.withRLS(ALICE, (tx) => tx.delete(libraries).where(eq(libraries.id, 'lib-alice-2')))
		).rejects.toThrow();
	});
});
