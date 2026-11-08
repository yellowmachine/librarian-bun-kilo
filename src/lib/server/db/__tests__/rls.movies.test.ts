import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../test-db';
import {
	movies,
	userMovies,
	libraries,
	tags,
	userMovieTags,
	groups,
	groupMembers,
	sharedTags,
	movieCoverPhotos
} from '../schema';
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

// 42501: "new row violates row-level security policy". Se comprueba el código
// para no dar por bueno otro error (p.ej. 42P17, recursión en las políticas).
const RLS_VIOLATION = '42501';

// ─── Grupos: etiquetas, visibilidad y fotos ───────────────────────────────────
// Bob comparte su etiqueta «Cine» con el grupo de Alice y Bob. Carol no está.

describe('RLS · películas en grupos', () => {
	const CAROL = 'user-carol';
	let tdb: TestDb;

	beforeEach(async () => {
		tdb = await createTestDb();
		await seedUsers(tdb);
		await tdb.asSuperuser(async (tx) => {
			await tx.execute(
				`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
				VALUES ('${CAROL}', 'Carol', 'carol@test.com', true, now(), now())` as string
			);
			await tx.insert(libraries).values([
				{ id: 'lib-alice', userId: ALICE, name: 'Default', isDefault: true },
				{ id: 'lib-bob', userId: BOB, name: 'Default', isDefault: true },
				{ id: 'lib-carol', userId: CAROL, name: 'Default', isDefault: true }
			]);
			await tx.insert(userMovies).values([
				{ id: 'um-bob-shared', userId: BOB, libraryId: 'lib-bob', title: 'Alien', format: 'dvd' },
				{
					id: 'um-bob-private',
					userId: BOB,
					libraryId: 'lib-bob',
					title: 'Privada',
					format: 'dvd'
				},
				{ id: 'um-carol', userId: CAROL, libraryId: 'lib-carol', title: 'De Carol', format: 'dvd' }
			]);
			await tx.insert(tags).values([
				{ id: 'tag-bob', userId: BOB, name: 'Cine' },
				{ id: 'tag-alice', userId: ALICE, name: 'Mía' }
			]);
			await tx.insert(userMovieTags).values({ userMovieId: 'um-bob-shared', tagId: 'tag-bob' });
			await tx.insert(groups).values({ id: 'grp', name: 'Club', createdBy: BOB });
			await tx.insert(groupMembers).values([
				{ groupId: 'grp', userId: BOB, role: 'owner' },
				{ groupId: 'grp', userId: ALICE, role: 'member' }
			]);
			await tx.insert(sharedTags).values({
				id: 'st',
				tagId: 'tag-bob',
				groupId: 'grp',
				sharedBy: BOB
			});
			await tx.insert(movieCoverPhotos).values({
				userMovieId: 'um-bob-shared',
				userId: BOB,
				contentType: 'image/jpeg',
				data: Uint8Array.from([0xff, 0xd8, 0xff])
			});
		});
	});
	afterEach(() => tdb.cleanup());

	it('un miembro ve las películas con etiqueta compartida, y solo esas', async () => {
		const rows = await tdb.withRLS(ALICE, (tx) =>
			tx.select({ id: userMovies.id }).from(userMovies).where(eq(userMovies.userId, BOB))
		);
		expect(rows.map((r) => r.id)).toEqual(['um-bob-shared']);
	});

	it('quien no está en el grupo no las ve', async () => {
		const rows = await tdb.withRLS(CAROL, (tx) =>
			tx.select({ id: userMovies.id }).from(userMovies).where(eq(userMovies.userId, BOB))
		);
		expect(rows).toEqual([]);
	});

	it('la foto de la carátula la ve quien ve la película', async () => {
		const asAlice = await tdb.withRLS(ALICE, (tx) => tx.select().from(movieCoverPhotos));
		expect(asAlice).toHaveLength(1);
		const asCarol = await tdb.withRLS(CAROL, (tx) => tx.select().from(movieCoverPhotos));
		expect(asCarol).toEqual([]);
	});

	it('pero solo el dueño cambia o borra la foto', async () => {
		await tdb.withRLS(ALICE, async (tx) => {
			await tx
				.update(movieCoverPhotos)
				.set({ contentType: 'image/png' })
				.where(eq(movieCoverPhotos.userMovieId, 'um-bob-shared'));
			await tx.delete(movieCoverPhotos).where(eq(movieCoverPhotos.userMovieId, 'um-bob-shared'));
		});
		const rows = await tdb.asSuperuser((tx) => tx.select().from(movieCoverPhotos));
		expect(rows).toHaveLength(1);
		expect(rows[0].contentType).toBe('image/jpeg');
	});

	it('nadie puede etiquetar una película ajena, aunque la vea', async () => {
		await expect(
			tdb.withRLS(ALICE, (tx) =>
				tx.insert(userMovieTags).values({ userMovieId: 'um-bob-shared', tagId: 'tag-alice' })
			)
		).rejects.toMatchObject({ cause: { code: RLS_VIOLATION } });
	});

	it('ni con una etiqueta ajena en una película propia', async () => {
		await tdb.asSuperuser((tx) =>
			tx.insert(userMovies).values({
				id: 'um-alice',
				userId: ALICE,
				libraryId: 'lib-alice',
				title: 'De Alice',
				format: 'dvd'
			})
		);
		await expect(
			tdb.withRLS(ALICE, (tx) =>
				tx.insert(userMovieTags).values({ userMovieId: 'um-alice', tagId: 'tag-bob' })
			)
		).rejects.toMatchObject({ cause: { code: RLS_VIOLATION } });
	});

	it('el dueño sí puede etiquetar su película con su etiqueta', async () => {
		await tdb.withRLS(BOB, (tx) =>
			tx.insert(userMovieTags).values({ userMovieId: 'um-bob-private', tagId: 'tag-bob' })
		);
		const rows = await tdb.withRLS(ALICE, (tx) =>
			tx.select({ id: userMovies.id }).from(userMovies).where(eq(userMovies.userId, BOB))
		);
		expect(rows.map((r) => r.id).sort()).toEqual(['um-bob-private', 'um-bob-shared']);
	});

	it('la etiqueta compartida es visible al grupo; quitarla deja de exponer la película', async () => {
		const visibleTags = await tdb.withRLS(ALICE, (tx) => tx.select().from(userMovieTags));
		expect(visibleTags).toEqual([{ userMovieId: 'um-bob-shared', tagId: 'tag-bob' }]);

		await tdb.withRLS(BOB, (tx) =>
			tx.delete(userMovieTags).where(eq(userMovieTags.userMovieId, 'um-bob-shared'))
		);
		const rows = await tdb.withRLS(ALICE, (tx) =>
			tx.select({ id: userMovies.id }).from(userMovies).where(eq(userMovies.userId, BOB))
		);
		expect(rows).toEqual([]);
	});
});
