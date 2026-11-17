import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../db/test-db';

// accountDeletion.ts y loans.ts usan la conexión real (db/index) y withRLS
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
vi.mock('../email', () => ({
	sendLoanRequestEmail: vi.fn(async () => {}),
	sendLoanAcceptedEmail: vi.fn(async () => {})
}));

import {
	deleteAccount,
	getDeletionPreview,
	isRecentSession,
	RECENT_SESSION_MS
} from '../accountDeletion';
import { getLoan, getUserLoans, transitionLoan, DELETED_ACCOUNT } from '../loans';

const ALICE = 'user-alice';
const BOB = 'user-bob';
const CAROL = 'user-carol';
const DAVE = 'user-dave';

async function run(...stmts: string[]) {
	await holder.tdb.asSuperuser(async (tx) => {
		for (const stmt of stmts) await tx.execute(stmt as never);
	});
}

async function rows<T>(query: string): Promise<T[]> {
	const res = await holder.tdb.asSuperuser((tx) => tx.execute(query as never));
	return res.rows as T[];
}

async function count(query: string): Promise<number> {
	const [row] = await rows<{ n: number | string }>(`SELECT count(*) AS n FROM ${query}`);
	return Number(row.n);
}

function loan(id: string, item: string, owner: string, borrower: string, status: string) {
	return `INSERT INTO loans (id, item_kind, user_book_id, item_title, owner_id, borrower_id, status)
		VALUES ('${id}', 'book', '${item}', '${id}-title', '${owner}', '${borrower}', '${status}')`;
}

// Bob tiene una biblioteca con libros, una película, etiquetas, reseña, foto de
// portada y clave de OpenRouter. Alice y Carol también tienen sus cosas.
beforeEach(async () => {
	holder.tdb = await createTestDb();
	await run(
		`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES
			('${ALICE}', 'Alice', 'alice@test.com', true, now(), now()),
			('${BOB}', 'Bob', 'bob@test.com', true, now(), now()),
			('${CAROL}', 'Carol', 'carol@test.com', true, now(), now()),
			('${DAVE}', 'Dave', 'dave@test.com', true, now(), now())`,
		`INSERT INTO session (id, user_id, token, expires_at, created_at, updated_at) VALUES ('s-bob', '${BOB}', 'tok', now() + interval '1 day', now(), now())`,
		`INSERT INTO books (id, title, authors) VALUES ('OL1', 'Dune', '{"Frank Herbert"}'), ('OL2', 'Emma', '{"Jane Austen"}')`,
		`INSERT INTO movies (id, title) VALUES ('tmdb-1', 'Alien')`,
		`INSERT INTO libraries (id, user_id, name, is_default) VALUES ('lib-bob', '${BOB}', 'Default', true), ('lib-alice', '${ALICE}', 'Default', true)`,
		`INSERT INTO user_books (id, user_id, library_id, book_id) VALUES
			('ub-bob1', '${BOB}', 'lib-bob', 'OL1'), ('ub-bob2', '${BOB}', 'lib-bob', 'OL2'),
			('ub-bob3', '${BOB}', 'lib-bob', 'OL1'), ('ub-alice', '${ALICE}', 'lib-alice', 'OL2')`,
		`INSERT INTO user_movies (id, user_id, library_id, movie_id, format) VALUES ('um-bob', '${BOB}', 'lib-bob', 'tmdb-1', 'dvd')`,
		`INSERT INTO tags (id, user_id, name) VALUES ('tag-bob', '${BOB}', 'Club'), ('tag-alice', '${ALICE}', 'Mías')`,
		`INSERT INTO user_book_tags (user_book_id, tag_id) VALUES ('ub-bob1', 'tag-bob'), ('ub-alice', 'tag-alice')`,
		`INSERT INTO book_reviews (id, book_id, user_id, rating) VALUES ('rv-bob', 'OL1', '${BOB}', 5), ('rv-alice', 'OL1', '${ALICE}', 3)`,
		`INSERT INTO user_api_keys (user_id, encrypted_api_key, iv, auth_tag) VALUES ('${BOB}', 'x', 'y', 'z')`
	);
});
afterEach(() => {
	holder.tdb.cleanup();
	vi.clearAllMocks();
});

describe('deleteAccount', () => {
	it('borra la cuenta y todo lo suyo, sin tocar lo de los demás', async () => {
		await deleteAccount(BOB);

		expect(await count(`"user" WHERE id = '${BOB}'`)).toBe(0);
		expect(await count(`session WHERE user_id = '${BOB}'`)).toBe(0);
		expect(await count(`libraries WHERE user_id = '${BOB}'`)).toBe(0);
		expect(await count(`user_books WHERE user_id = '${BOB}'`)).toBe(0);
		expect(await count(`user_movies WHERE user_id = '${BOB}'`)).toBe(0);
		expect(await count(`tags WHERE user_id = '${BOB}'`)).toBe(0);
		expect(await count(`book_reviews WHERE user_id = '${BOB}'`)).toBe(0);
		expect(await count(`user_api_keys WHERE user_id = '${BOB}'`)).toBe(0);

		// Lo de Alice, intacto (el catálogo compartido también)
		expect(await count(`user_books WHERE user_id = '${ALICE}'`)).toBe(1);
		expect(await count(`user_book_tags WHERE tag_id = 'tag-alice'`)).toBe(1);
		expect(await count(`book_reviews WHERE user_id = '${ALICE}'`)).toBe(1);
		expect(await count(`books`)).toBe(2);
	});

	it('el grupo que creó pasa al admin más antiguo y deja de ver lo que él compartía', async () => {
		await run(
			`INSERT INTO groups (id, name, created_by) VALUES ('grp', 'Club', '${BOB}')`,
			`INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES
				('grp', '${BOB}', 'owner', now() - interval '3 days'),
				('grp', '${ALICE}', 'member', now() - interval '2 days'),
				('grp', '${CAROL}', 'admin', now() - interval '1 day'),
				('grp', '${DAVE}', 'admin', now())`,
			`INSERT INTO shared_tags (id, tag_id, group_id, shared_by) VALUES ('st', 'tag-bob', 'grp', '${BOB}')`
		);

		const preview = await getDeletionPreview(BOB);
		expect(preview.groups).toEqual([{ id: 'grp', name: 'Club', heirName: 'Carol' }]);

		await deleteAccount(BOB);

		expect(await rows(`SELECT created_by FROM groups WHERE id = 'grp'`)).toEqual([
			{ created_by: CAROL }
		]);
		expect(
			await rows(`SELECT user_id, role FROM group_members WHERE group_id = 'grp' ORDER BY user_id`)
		).toEqual([
			{ user_id: ALICE, role: 'member' },
			{ user_id: CAROL, role: 'owner' },
			{ user_id: DAVE, role: 'admin' }
		]);
		expect(await count(`shared_tags WHERE group_id = 'grp'`)).toBe(0);

		// La nueva owner puede borrarlo (groups_delete)
		const deleted = await holder.tdb.withRLS(CAROL, (tx) =>
			tx.execute(`DELETE FROM groups WHERE id = 'grp' RETURNING id` as never)
		);
		expect(deleted.rows).toHaveLength(1);
	});

	it('sin admins, el grupo pasa al miembro más antiguo; si estaba solo, se borra', async () => {
		await run(
			`INSERT INTO groups (id, name, created_by) VALUES ('grp', 'Club', '${BOB}'), ('solo', 'Solo', '${BOB}')`,
			`INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES
				('grp', '${BOB}', 'owner', now() - interval '3 days'),
				('grp', '${DAVE}', 'member', now() - interval '1 day'),
				('grp', '${ALICE}', 'member', now() - interval '2 days'),
				('solo', '${BOB}', 'owner', now())`
		);

		const preview = await getDeletionPreview(BOB);
		expect(preview.groups).toEqual([
			{ id: 'grp', name: 'Club', heirName: 'Alice' },
			{ id: 'solo', name: 'Solo', heirName: null }
		]);

		await deleteAccount(BOB);

		expect(await rows(`SELECT id, created_by FROM groups`)).toEqual([
			{ id: 'grp', created_by: ALICE }
		]);
		expect(
			await rows(`SELECT role FROM group_members WHERE group_id = 'grp' AND user_id = '${ALICE}'`)
		).toEqual([{ role: 'owner' }]);
	});

	it('solo quien creó el grupo puede pasarlo (hand_over_group)', async () => {
		await run(
			`INSERT INTO groups (id, name, created_by) VALUES ('grp', 'Club', '${BOB}')`,
			`INSERT INTO group_members (group_id, user_id, role) VALUES ('grp', '${BOB}', 'owner'), ('grp', '${ALICE}', 'admin'), ('grp', '${CAROL}', 'member')`
		);
		// Una admin no puede quedárselo
		await expect(
			holder.tdb.withRLS(ALICE, (tx) =>
				tx.execute(`SELECT hand_over_group('grp', '${ALICE}')` as never)
			)
		).rejects.toThrow();
		// Ni el creador dárselo a alguien de fuera
		await expect(
			holder.tdb.withRLS(BOB, (tx) =>
				tx.execute(`SELECT hand_over_group('grp', '${DAVE}')` as never)
			)
		).rejects.toThrow();
		expect(await rows(`SELECT created_by FROM groups`)).toEqual([{ created_by: BOB }]);
	});

	it('sale de los grupos donde solo es miembro', async () => {
		await run(
			`INSERT INTO groups (id, name, created_by) VALUES ('grp', 'Club', '${ALICE}')`,
			`INSERT INTO group_members (group_id, user_id, role) VALUES ('grp', '${ALICE}', 'owner'), ('grp', '${BOB}', 'member')`
		);
		await deleteAccount(BOB);
		expect(await rows(`SELECT user_id FROM group_members`)).toEqual([{ user_id: ALICE }]);
		expect(await rows(`SELECT created_by FROM groups`)).toEqual([{ created_by: ALICE }]);
	});

	it('anula sus invitaciones abiertas y deja las usadas', async () => {
		await run(
			`INSERT INTO invitations (id, email, token, invited_by, expires_at, used_at) VALUES
				('inv-open', 'x@test.com', 't1', '${BOB}', now() + interval '7 days', null),
				('inv-used', 'y@test.com', 't2', '${BOB}', now() + interval '7 days', now())`
		);
		await deleteAccount(BOB);
		expect(
			await rows(
				`SELECT id, invited_by, cancelled_at IS NOT NULL AS cancelled FROM invitations ORDER BY id`
			)
		).toEqual([
			{ id: 'inv-open', invited_by: null, cancelled: true },
			{ id: 'inv-used', invited_by: null, cancelled: false }
		]);
	});
});

describe('préstamos de quien borra su cuenta', () => {
	beforeEach(async () => {
		await run(
			// Bob presta: uno pedido, uno en curso, uno devuelto
			loan('l-requested', 'ub-bob1', BOB, ALICE, 'requested'),
			loan('l-lent', 'ub-bob2', BOB, ALICE, 'active'),
			loan('l-returned', 'ub-bob3', BOB, ALICE, 'returned'),
			// Bob tiene el libro de Alice, y pidió otro que ya se aceptó
			loan('l-borrowed', 'ub-alice', ALICE, BOB, 'return_requested'),
			loan('l-accepted', 'ub-alice', ALICE, BOB, 'accepted'),
			`UPDATE user_books SET is_available = false WHERE id IN ('ub-bob2', 'ub-alice')`
		);
	});

	it('no bloquea: avisa de los préstamos en curso', async () => {
		const preview = await getDeletionPreview(BOB);
		expect(preview.inProgressLoans).toEqual([
			{ id: 'l-lent', title: 'l-lent-title', otherName: 'Alice', asOwner: true },
			{ id: 'l-borrowed', title: 'l-borrowed-title', otherName: 'Alice', asOwner: false }
		]);
		await expect(deleteAccount(BOB)).resolves.toBeUndefined();
	});

	it('cancela los sin entregar, guarda su nombre solo en los en curso', async () => {
		await deleteAccount(BOB);

		expect(
			await rows(
				`SELECT id, status, owner_id, borrower_id, owner_name, borrower_name FROM loans ORDER BY id`
			)
		).toEqual([
			{
				id: 'l-accepted',
				status: 'cancelled',
				owner_id: ALICE,
				borrower_id: null,
				owner_name: null,
				borrower_name: null
			},
			{
				id: 'l-borrowed',
				status: 'return_requested',
				owner_id: ALICE,
				borrower_id: null,
				owner_name: null,
				borrower_name: 'Bob'
			},
			{
				id: 'l-lent',
				status: 'active',
				owner_id: null,
				borrower_id: ALICE,
				owner_name: 'Bob',
				borrower_name: null
			},
			{
				id: 'l-requested',
				status: 'cancelled',
				owner_id: null,
				borrower_id: ALICE,
				owner_name: null,
				borrower_name: null
			},
			{
				id: 'l-returned',
				status: 'returned',
				owner_id: null,
				borrower_id: ALICE,
				owner_name: null,
				borrower_name: null
			}
		]);
	});

	it('la otra parte sigue viendo su historial, con «Cuenta borrada» o el nombre guardado', async () => {
		await deleteAccount(BOB);
		const { asOwner, asBorrower } = await getUserLoans(ALICE);

		const byId = Object.fromEntries([...asOwner, ...asBorrower].map((l) => [l.id, l]));
		expect(Object.keys(byId).sort()).toEqual([
			'l-accepted',
			'l-borrowed',
			'l-lent',
			'l-requested',
			'l-returned'
		]);
		expect(byId['l-borrowed']).toMatchObject({
			borrowerName: 'Bob',
			borrowerDeleted: true,
			borrowerEmail: '',
			ownerName: 'Alice',
			ownerDeleted: false
		});
		expect(byId['l-lent']).toMatchObject({ ownerName: 'Bob', ownerDeleted: true });
		expect(byId['l-returned']).toMatchObject({ ownerName: DELETED_ACCOUNT, ownerDeleted: true });
		// La copia de Bob se borró: queda la foto fija del préstamo
		expect(byId['l-lent']).toMatchObject({ title: 'l-lent-title', itemHref: null });
	});

	it('quien queda puede cerrar el préstamo en curso', async () => {
		await deleteAccount(BOB);

		// Alice recupera su libro sin que Bob confirme nada
		expect(await transitionLoan(ALICE, 'l-borrowed', 'returned')).toEqual({ success: true });
		expect(await rows(`SELECT is_available FROM user_books WHERE id = 'ub-alice'`)).toEqual([
			{ is_available: true }
		]);
		// Y el que tenía de Bob, lo da por cerrado
		expect(await transitionLoan(ALICE, 'l-lent', 'returned')).toEqual({ success: true });
		expect((await getLoan(ALICE, 'l-lent'))?.status).toBe('returned');
	});

	it('cerrar sin confirmar sigue sin valer si la otra parte existe', async () => {
		const res = await transitionLoan(ALICE, 'l-lent', 'returned');
		expect(res.success).toBe(false);
	});

	it('un préstamo sin una de las partes no lo ve nadie más', async () => {
		await deleteAccount(BOB);
		const seen = await holder.tdb.withRLS(CAROL, (tx) =>
			tx.execute(`SELECT id FROM loans` as never)
		);
		expect(seen.rows).toEqual([]);
	});
});

describe('isRecentSession', () => {
	it('vale una sesión de menos de 15 minutos', () => {
		const now = Date.now();
		expect(isRecentSession(new Date(now - 60_000), now)).toBe(true);
		expect(isRecentSession(new Date(now - RECENT_SESSION_MS - 1), now)).toBe(false);
	});
});
