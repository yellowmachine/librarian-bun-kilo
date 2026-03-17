import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../test-db';
import { books, userBooks, loans } from '../schema';
import { eq } from 'drizzle-orm';

const ALICE = 'user-alice'; // propietaria del libro
const BOB = 'user-bob'; // prestatario
const CAROL = 'user-carol'; // tercero sin relación

async function seedBase(tdb: TestDb) {
	await tdb.asSuperuser(async (tx) => {
		// Usuarios
		await tx.execute(
			`
			INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
			VALUES
				('${ALICE}', 'Alice', 'alice@test.com', true, now(), now()),
				('${BOB}',   'Bob',   'bob@test.com',   true, now(), now()),
				('${CAROL}', 'Carol', 'carol@test.com', true, now(), now())
		` as any
		);

		// Libro en el catálogo
		await tx.insert(books).values({ id: 'OL1', title: 'Dune', authors: ['Frank Herbert'] });

		// Alice tiene el libro
		await tx.insert(userBooks).values({
			id: 'ub-alice',
			userId: ALICE,
			bookId: 'OL1',
			isAvailable: true,
			addedAt: new Date(),
			updatedAt: new Date()
		});

		// Préstamo: bob solicita el libro de alice
		await tx.insert(loans).values({
			id: 'loan-1',
			userBookId: 'ub-alice',
			borrowerId: BOB,
			ownerId: ALICE,
			status: 'requested',
			requestedAt: new Date()
		});
	});
}

// ─── loans: visibilidad ───────────────────────────────────────────────────────

describe('RLS · loans · visibilidad', () => {
	let tdb: TestDb;
	beforeEach(async () => {
		tdb = await createTestDb();
		await seedBase(tdb);
	});
	afterEach(() => tdb.cleanup());

	it('alice (owner) ve el préstamo', async () => {
		const rows = await tdb.withRLS(ALICE, (tx) => tx.select().from(loans));
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe('loan-1');
	});

	it('bob (borrower) ve el préstamo', async () => {
		const rows = await tdb.withRLS(BOB, (tx) => tx.select().from(loans));
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe('loan-1');
	});

	it('carol (tercero) no ve ningún préstamo', async () => {
		const rows = await tdb.withRLS(CAROL, (tx) => tx.select().from(loans));
		expect(rows).toHaveLength(0);
	});
});

// ─── loans: inserción ─────────────────────────────────────────────────────────

describe('RLS · loans · inserción', () => {
	let tdb: TestDb;
	beforeEach(async () => {
		tdb = await createTestDb();
		await seedBase(tdb);
	});
	afterEach(() => tdb.cleanup());

	it('bob puede solicitar un préstamo a su nombre', async () => {
		// Primero necesitamos otro userBook de Alice
		await tdb.asSuperuser((tx) =>
			tx.insert(books).values({ id: 'OL2', title: '1984', authors: ['Orwell'] })
		);
		await tdb.asSuperuser((tx) =>
			tx.insert(userBooks).values({
				id: 'ub-alice-2',
				userId: ALICE,
				bookId: 'OL2',
				isAvailable: true,
				addedAt: new Date(),
				updatedAt: new Date()
			})
		);

		await tdb.withRLS(BOB, (tx) =>
			tx.insert(loans).values({
				id: 'loan-2',
				userBookId: 'ub-alice-2',
				borrowerId: BOB,
				ownerId: ALICE,
				status: 'requested',
				requestedAt: new Date()
			})
		);

		const rows = await tdb.withRLS(BOB, (tx) => tx.select().from(loans));
		expect(rows).toHaveLength(2);
	});

	it('alice no puede crear un préstamo poniendo a carol como borrower', async () => {
		// La política INSERT exige borrower_id = current_user_id
		await expect(
			tdb.withRLS(ALICE, (tx) =>
				tx.insert(loans).values({
					id: 'loan-fraud',
					userBookId: 'ub-alice',
					borrowerId: CAROL, // alice intenta suplantar a carol
					ownerId: ALICE,
					status: 'requested',
					requestedAt: new Date()
				})
			)
		).rejects.toThrow();
	});
});

// ─── loans: actualización ─────────────────────────────────────────────────────

describe('RLS · loans · actualización', () => {
	let tdb: TestDb;
	beforeEach(async () => {
		tdb = await createTestDb();
		await seedBase(tdb);
	});
	afterEach(() => tdb.cleanup());

	it('alice puede cambiar el estado del préstamo (es owner)', async () => {
		await tdb.withRLS(ALICE, (tx) =>
			tx.update(loans).set({ status: 'accepted' }).where(eq(loans.id, 'loan-1'))
		);
		const rows = await tdb.asSuperuser((tx) =>
			tx.select().from(loans).where(eq(loans.id, 'loan-1'))
		);
		expect(rows[0].status).toBe('accepted');
	});

	it('bob puede cambiar el estado del préstamo (es borrower)', async () => {
		await tdb.withRLS(BOB, (tx) =>
			tx.update(loans).set({ status: 'cancelled' }).where(eq(loans.id, 'loan-1'))
		);
		const rows = await tdb.asSuperuser((tx) =>
			tx.select().from(loans).where(eq(loans.id, 'loan-1'))
		);
		expect(rows[0].status).toBe('cancelled');
	});

	it('carol no puede modificar préstamos ajenos', async () => {
		await tdb.withRLS(CAROL, (tx) =>
			tx.update(loans).set({ status: 'returned' }).where(eq(loans.id, 'loan-1'))
		);
		const rows = await tdb.asSuperuser((tx) =>
			tx.select().from(loans).where(eq(loans.id, 'loan-1'))
		);
		expect(rows[0].status).toBe('requested'); // sin cambios
	});
});

// ─── loans: eliminación ───────────────────────────────────────────────────────

describe('RLS · loans · eliminación', () => {
	let tdb: TestDb;
	beforeEach(async () => {
		tdb = await createTestDb();
		await seedBase(tdb);
	});
	afterEach(() => tdb.cleanup());

	it('bob puede cancelar (borrar) su propia solicitud en estado requested', async () => {
		await tdb.withRLS(BOB, (tx) => tx.delete(loans).where(eq(loans.id, 'loan-1')));
		const rows = await tdb.asSuperuser((tx) =>
			tx.select().from(loans).where(eq(loans.id, 'loan-1'))
		);
		expect(rows).toHaveLength(0);
	});

	it('alice (owner) no puede borrar el préstamo (solo el borrower puede)', async () => {
		await tdb.withRLS(ALICE, (tx) => tx.delete(loans).where(eq(loans.id, 'loan-1')));
		const rows = await tdb.asSuperuser((tx) =>
			tx.select().from(loans).where(eq(loans.id, 'loan-1'))
		);
		expect(rows).toHaveLength(1); // la política DELETE solo permite al borrower
	});

	it('carol no puede borrar préstamos ajenos', async () => {
		await tdb.withRLS(CAROL, (tx) => tx.delete(loans).where(eq(loans.id, 'loan-1')));
		const rows = await tdb.asSuperuser((tx) =>
			tx.select().from(loans).where(eq(loans.id, 'loan-1'))
		);
		expect(rows).toHaveLength(1);
	});
});
