import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../test-db';
import {
	books,
	userBooks,
	tags,
	libraries,
	userBookTags,
	groups,
	groupMembers,
	sharedTags,
	bookCoverPhotos
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

async function seedBook(tdb: TestDb, bookId: string) {
	await tdb.asSuperuser(async (tx) => {
		await tx
			.insert(books)
			.values({ id: bookId, title: `Book ${bookId}`, authors: [] })
			.onConflictDoNothing();
	});
}

async function seedLibrary(tdb: TestDb, id: string, userId: string) {
	await tdb.asSuperuser(async (tx) => {
		await tx.insert(libraries).values({ id, userId, name: 'Default', isDefault: true });
	});
}

// ─── books ────────────────────────────────────────────────────────────────────

describe('RLS · books (catálogo global)', () => {
	let tdb: TestDb;
	beforeEach(async () => {
		tdb = await createTestDb();
		await seedUsers(tdb);
	});
	afterEach(() => tdb.cleanup());

	it('cualquier usuario puede leer el catálogo', async () => {
		await tdb.asSuperuser((tx) =>
			tx.insert(books).values({ id: 'OL1', title: 'Moby Dick', authors: [] })
		);

		const rows = await tdb.withRLS(ALICE, (tx) => tx.select().from(books));
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe('OL1');
	});

	it('cualquier usuario puede insertar en el catálogo', async () => {
		await tdb.withRLS(ALICE, (tx) =>
			tx.insert(books).values({ id: 'OL2', title: 'Dune', authors: ['Frank Herbert'] })
		);
		const rows = await tdb.withRLS(BOB, (tx) => tx.select().from(books));
		expect(rows).toHaveLength(1);
	});
});

// ─── user_books ───────────────────────────────────────────────────────────────

describe('RLS · user_books', () => {
	let tdb: TestDb;
	beforeEach(async () => {
		tdb = await createTestDb();
		await seedUsers(tdb);
		await seedBook(tdb, 'OL1');
		await seedBook(tdb, 'OL2');
		await seedLibrary(tdb, 'lib-alice', ALICE);
		await seedLibrary(tdb, 'lib-bob', BOB);

		// Alice tiene OL1, Bob tiene OL2
		await tdb.asSuperuser((tx) =>
			tx.insert(userBooks).values([
				{
					id: 'ub-alice',
					userId: ALICE,
					libraryId: 'lib-alice',
					bookId: 'OL1',
					isAvailable: true,
					addedAt: new Date(),
					updatedAt: new Date()
				},
				{
					id: 'ub-bob',
					userId: BOB,
					libraryId: 'lib-bob',
					bookId: 'OL2',
					isAvailable: true,
					addedAt: new Date(),
					updatedAt: new Date()
				}
			])
		);
	});
	afterEach(() => tdb.cleanup());

	it('alice solo ve sus propios libros', async () => {
		const rows = await tdb.withRLS(ALICE, (tx) => tx.select().from(userBooks));
		expect(rows).toHaveLength(1);
		expect(rows[0].userId).toBe(ALICE);
	});

	it('bob solo ve sus propios libros', async () => {
		const rows = await tdb.withRLS(BOB, (tx) => tx.select().from(userBooks));
		expect(rows).toHaveLength(1);
		expect(rows[0].userId).toBe(BOB);
	});

	it('alice no puede insertar un libro a nombre de bob', async () => {
		await expect(
			tdb.withRLS(ALICE, (tx) =>
				tx.insert(userBooks).values({
					id: 'ub-fraud',
					userId: BOB, // intenta insertar como bob
					libraryId: 'lib-bob',
					bookId: 'OL1',
					isAvailable: true,
					addedAt: new Date(),
					updatedAt: new Date()
				})
			)
		).rejects.toThrow();
	});

	it('alice no puede actualizar el libro de bob', async () => {
		// El UPDATE no lanza error — RLS silencia la operación (0 rows affected)
		await tdb.withRLS(ALICE, (tx) =>
			tx.update(userBooks).set({ isAvailable: false }).where(eq(userBooks.id, 'ub-bob'))
		);
		// Verificar que no cambió
		const rows = await tdb.asSuperuser((tx) =>
			tx.select().from(userBooks).where(eq(userBooks.id, 'ub-bob'))
		);
		expect(rows[0].isAvailable).toBe(true);
	});

	it('alice no puede borrar el libro de bob', async () => {
		await tdb.withRLS(ALICE, (tx) => tx.delete(userBooks).where(eq(userBooks.id, 'ub-bob')));
		const rows = await tdb.asSuperuser((tx) =>
			tx.select().from(userBooks).where(eq(userBooks.id, 'ub-bob'))
		);
		expect(rows).toHaveLength(1); // sigue existiendo
	});
});

// ─── tags ─────────────────────────────────────────────────────────────────────

describe('RLS · tags', () => {
	let tdb: TestDb;
	beforeEach(async () => {
		tdb = await createTestDb();
		await seedUsers(tdb);

		await tdb.asSuperuser((tx) =>
			tx.insert(tags).values([
				{ id: 'tag-alice', userId: ALICE, name: 'Ciencia Ficción', createdAt: new Date() },
				{ id: 'tag-bob', userId: BOB, name: 'Terror', createdAt: new Date() }
			])
		);
	});
	afterEach(() => tdb.cleanup());

	it('alice solo ve sus propias etiquetas', async () => {
		const rows = await tdb.withRLS(ALICE, (tx) => tx.select().from(tags));
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe('tag-alice');
	});

	it('bob solo ve sus propias etiquetas', async () => {
		const rows = await tdb.withRLS(BOB, (tx) => tx.select().from(tags));
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe('tag-bob');
	});

	it('alice puede crear sus propias etiquetas', async () => {
		await tdb.withRLS(ALICE, (tx) =>
			tx
				.insert(tags)
				.values({ id: 'tag-alice-2', userId: ALICE, name: 'Fantasía', createdAt: new Date() })
		);
		const rows = await tdb.withRLS(ALICE, (tx) => tx.select().from(tags));
		expect(rows).toHaveLength(2);
	});

	it('alice no puede crear etiquetas a nombre de bob', async () => {
		await expect(
			tdb.withRLS(ALICE, (tx) =>
				tx
					.insert(tags)
					.values({ id: 'tag-fraud', userId: BOB, name: 'Fraude', createdAt: new Date() })
			)
		).rejects.toThrow();
	});

	it('alice no puede borrar etiquetas de bob', async () => {
		await tdb.withRLS(ALICE, (tx) => tx.delete(tags).where(eq(tags.id, 'tag-bob')));
		const rows = await tdb.asSuperuser((tx) =>
			tx.select().from(tags).where(eq(tags.id, 'tag-bob'))
		);
		expect(rows).toHaveLength(1);
	});
});

// ─── user_book_tags: solo tus etiquetas en tus libros ─────────────────────────
// Bob comparte «Club» con el grupo de Alice y Bob. Alice tiene su propia
// etiqueta «Mía», compartida con otro grupo suyo donde Bob no está.

describe('RLS · user_book_tags', () => {
	// 42501: "new row violates row-level security policy". Se comprueba el código
	// para no dar por bueno otro error (p.ej. 42P17, recursión en las políticas).
	const RLS_VIOLATION = '42501';
	let tdb: TestDb;

	beforeEach(async () => {
		tdb = await createTestDb();
		await seedUsers(tdb);
		await seedBook(tdb, 'OL1');
		await seedLibrary(tdb, 'lib-alice', ALICE);
		await seedLibrary(tdb, 'lib-bob', BOB);
		await tdb.asSuperuser(async (tx) => {
			await tx.insert(userBooks).values([
				{ id: 'ub-bob', userId: BOB, libraryId: 'lib-bob', bookId: 'OL1' },
				{ id: 'ub-alice', userId: ALICE, libraryId: 'lib-alice', bookId: 'OL1' }
			]);
			await tx.insert(tags).values([
				{ id: 'tag-bob', userId: BOB, name: 'Club' },
				{ id: 'tag-alice', userId: ALICE, name: 'Mía' }
			]);
			await tx.insert(userBookTags).values({ userBookId: 'ub-bob', tagId: 'tag-bob' });
			await tx.insert(groups).values([
				{ id: 'grp-club', name: 'Club', createdBy: BOB },
				{ id: 'grp-alice', name: 'Otro', createdBy: ALICE }
			]);
			await tx.insert(groupMembers).values([
				{ groupId: 'grp-club', userId: BOB, role: 'owner' },
				{ groupId: 'grp-club', userId: ALICE, role: 'member' },
				{ groupId: 'grp-alice', userId: ALICE, role: 'owner' }
			]);
			await tx.insert(sharedTags).values([
				{ id: 'st-club', tagId: 'tag-bob', groupId: 'grp-club', sharedBy: BOB },
				{ id: 'st-alice', tagId: 'tag-alice', groupId: 'grp-alice', sharedBy: ALICE }
			]);
		});
	});
	afterEach(() => tdb.cleanup());

	it('alice ve el libro de bob por el grupo, pero no puede ponerle su etiqueta', async () => {
		const visible = await tdb.withRLS(ALICE, (tx) =>
			tx.select({ id: userBooks.id }).from(userBooks).where(eq(userBooks.id, 'ub-bob'))
		);
		expect(visible).toHaveLength(1);

		await expect(
			tdb.withRLS(ALICE, (tx) =>
				tx.insert(userBookTags).values({ userBookId: 'ub-bob', tagId: 'tag-alice' })
			)
		).rejects.toMatchObject({ cause: { code: RLS_VIOLATION } });
	});

	it('ni poner una etiqueta ajena en un libro propio', async () => {
		await expect(
			tdb.withRLS(ALICE, (tx) =>
				tx.insert(userBookTags).values({ userBookId: 'ub-alice', tagId: 'tag-bob' })
			)
		).rejects.toMatchObject({ cause: { code: RLS_VIOLATION } });
	});

	it('el dueño sí etiqueta su libro con su etiqueta', async () => {
		await tdb.withRLS(ALICE, (tx) =>
			tx.insert(userBookTags).values({ userBookId: 'ub-alice', tagId: 'tag-alice' })
		);
		const rows = await tdb.withRLS(ALICE, (tx) =>
			tx.select().from(userBookTags).where(eq(userBookTags.userBookId, 'ub-alice'))
		);
		expect(rows).toEqual([{ userBookId: 'ub-alice', tagId: 'tag-alice' }]);
	});

	describe('foto de la portada', () => {
		const JPEG = Uint8Array.from([0xff, 0xd8, 0xff]);

		beforeEach(async () => {
			await tdb.asSuperuser((tx) =>
				tx.insert(bookCoverPhotos).values([
					{ userBookId: 'ub-bob', userId: BOB, contentType: 'image/jpeg', data: JPEG },
					{ userBookId: 'ub-alice', userId: ALICE, contentType: 'image/jpeg', data: JPEG }
				])
			);
		});

		it('la ve quien ve el libro, y solo esa', async () => {
			const asAlice = await tdb.withRLS(ALICE, (tx) =>
				tx.select({ id: bookCoverPhotos.userBookId }).from(bookCoverPhotos)
			);
			expect(asAlice.map((r) => r.id).sort()).toEqual(['ub-alice', 'ub-bob']);
			// El libro de alice no está en ningún grupo de bob.
			const asBob = await tdb.withRLS(BOB, (tx) =>
				tx.select({ id: bookCoverPhotos.userBookId }).from(bookCoverPhotos)
			);
			expect(asBob.map((r) => r.id)).toEqual(['ub-bob']);
		});

		it('pero solo el dueño la cambia o la borra', async () => {
			await tdb.withRLS(ALICE, async (tx) => {
				await tx
					.update(bookCoverPhotos)
					.set({ contentType: 'image/png' })
					.where(eq(bookCoverPhotos.userBookId, 'ub-bob'));
				await tx.delete(bookCoverPhotos).where(eq(bookCoverPhotos.userBookId, 'ub-bob'));
			});
			const rows = await tdb.asSuperuser((tx) =>
				tx.select().from(bookCoverPhotos).where(eq(bookCoverPhotos.userBookId, 'ub-bob'))
			);
			expect(rows).toHaveLength(1);
			expect(rows[0].contentType).toBe('image/jpeg');
		});

		it('nadie pone una foto a nombre de otro', async () => {
			await tdb.asSuperuser((tx) =>
				tx.delete(bookCoverPhotos).where(eq(bookCoverPhotos.userBookId, 'ub-bob'))
			);
			await expect(
				tdb.withRLS(ALICE, (tx) =>
					tx
						.insert(bookCoverPhotos)
						.values({ userBookId: 'ub-bob', userId: BOB, contentType: 'image/jpeg', data: JPEG })
				)
			).rejects.toMatchObject({ cause: { code: RLS_VIOLATION } });
		});

		it('se borra con el libro', async () => {
			await tdb.withRLS(ALICE, (tx) => tx.delete(userBooks).where(eq(userBooks.id, 'ub-alice')));
			const rows = await tdb.asSuperuser((tx) =>
				tx.select().from(bookCoverPhotos).where(eq(bookCoverPhotos.userBookId, 'ub-alice'))
			);
			expect(rows).toEqual([]);
		});
	});
});
