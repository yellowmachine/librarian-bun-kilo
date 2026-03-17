import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../test-db';
import { books, userBooks, tags, userBookTags } from '../schema';
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
		` as any
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

		// Alice tiene OL1, Bob tiene OL2
		await tdb.asSuperuser((tx) =>
			tx.insert(userBooks).values([
				{
					id: 'ub-alice',
					userId: ALICE,
					bookId: 'OL1',
					isAvailable: true,
					addedAt: new Date(),
					updatedAt: new Date()
				},
				{
					id: 'ub-bob',
					userId: BOB,
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
