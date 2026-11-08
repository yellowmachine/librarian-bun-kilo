import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../db/test-db';

// books.ts usa la conexión real (db/index) y withRLS (db/rls): se redirigen a
// una base PGlite en memoria por test.
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

import { addBookToLibrary, getContactBooks, getUserBook, forBookViewer } from '../books';

const ALICE = 'user-alice';
const BOB = 'user-bob';

beforeEach(async () => {
	holder.tdb = await createTestDb();
	// Bob tiene «Dune» con una etiqueta compartida con el grupo de Alice y Bob.
	const seed = [
		`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('${ALICE}', 'Alice', 'alice@test.com', true, now(), now()), ('${BOB}', 'Bob', 'bob@test.com', true, now(), now())`,
		`INSERT INTO books (id, title, authors) VALUES ('OL1', 'Dune', '{}')`,
		`INSERT INTO libraries (id, user_id, name, is_default) VALUES ('lib-bob', '${BOB}', 'Default', true)`,
		`INSERT INTO user_books (id, user_id, library_id, book_id, notes) VALUES ('ub-bob', '${BOB}', 'lib-bob', 'OL1', 'Se lo dejé a mi hermana')`,
		`INSERT INTO tags (id, user_id, name) VALUES ('tag-bob', '${BOB}', 'Club')`,
		`INSERT INTO user_book_tags (user_book_id, tag_id) VALUES ('ub-bob', 'tag-bob')`,
		`INSERT INTO groups (id, name, created_by) VALUES ('grp', 'Club', '${BOB}')`,
		`INSERT INTO group_members (group_id, user_id, role) VALUES ('grp', '${BOB}', 'owner'), ('grp', '${ALICE}', 'member')`,
		`INSERT INTO shared_tags (id, tag_id, group_id, shared_by) VALUES ('st', 'tag-bob', 'grp', '${BOB}')`
	];
	await holder.tdb.asSuperuser(async (tx) => {
		for (const stmt of seed) await tx.execute(stmt as string);
	});
});
afterEach(() => holder.tdb.cleanup());

describe('addBookToLibrary', () => {
	it('no devuelve la copia de otro usuario visible por grupo: crea la propia', async () => {
		const id = await addBookToLibrary(ALICE, { bookId: 'OL1' });

		expect(id).not.toBe('ub-bob');
		const rows = await holder.tdb.asSuperuser((tx) =>
			tx.execute(`SELECT user_id FROM user_books WHERE id = '${id}'` as string)
		);
		expect(rows.rows).toEqual([{ user_id: ALICE }]);
	});

	it('sí reutiliza la copia propia si ya la tiene', async () => {
		const first = await addBookToLibrary(ALICE, { bookId: 'OL1' });
		expect(await addBookToLibrary(ALICE, { bookId: 'OL1' })).toBe(first);
	});
});

describe('lo que ve quien no es el dueño', () => {
	it('los libros de un contacto llegan sin notas ni biblioteca', async () => {
		const books = await getContactBooks(ALICE, BOB);
		expect(books.map((b) => b.userBookId)).toEqual(['ub-bob']);
		expect(books[0]).toMatchObject({ notes: null, libraryId: '' });
	});

	it('la ficha de otro, sin lo privado; la propia, entera', async () => {
		const asAlice = await getUserBook(ALICE, 'ub-bob');
		expect(forBookViewer(asAlice!, ALICE)).toMatchObject({ notes: null, libraryId: '' });

		const asBob = await getUserBook(BOB, 'ub-bob');
		expect(forBookViewer(asBob!, BOB)).toMatchObject({
			notes: 'Se lo dejé a mi hermana',
			libraryId: 'lib-bob'
		});
	});
});
