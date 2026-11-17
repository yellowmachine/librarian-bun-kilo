import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../db/test-db';

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
	getGroupBooks,
	searchBooksFromOthers,
	getGroupItemCounts,
	getTagGroupShares,
	getUserTagsForGroup,
	getSharedTagsInGroup,
	getSharedTagsForUser,
	deleteGroup
} from '../groups';

const ALICE = 'user-alice';
const BOB = 'user-bob';
const CAROL = 'user-carol';

beforeEach(async () => {
	holder.tdb = await createTestDb();
	// «Pareja» = Alice + Bob; «Club» = Alice + Bob + Carol.
	// Bob comparte «Dune» solo en Pareja y «Emma» solo en Club; Carol comparte
	// «Ulises» en Club; Alice comparte su «Dune» en Pareja.
	const seed = [
		`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES
			('${ALICE}', 'Alice', 'alice@test.com', true, now(), now()),
			('${BOB}', 'Bob', 'bob@test.com', true, now(), now()),
			('${CAROL}', 'Carol', 'carol@test.com', true, now(), now())`,
		`INSERT INTO libraries (id, user_id, name, is_default) VALUES
			('lib-a', '${ALICE}', 'Default', true),
			('lib-b', '${BOB}', 'Default', true),
			('lib-c', '${CAROL}', 'Default', true)`,
		`INSERT INTO user_books (id, user_id, library_id, title, authors) VALUES
			('ub-a-dune', '${ALICE}', 'lib-a', 'Dune', '{}'),
			('ub-b-dune', '${BOB}', 'lib-b', 'Dune', '{}'),
			('ub-b-emma', '${BOB}', 'lib-b', 'Emma', '{}'),
			('ub-c-ulises', '${CAROL}', 'lib-c', 'Ulises', '{}')`,
		`INSERT INTO tags (id, user_id, name) VALUES
			('tag-a', '${ALICE}', 'Mine'),
			('tag-b-pareja', '${BOB}', 'Para Alice'),
			('tag-b-club', '${BOB}', 'Club'),
			('tag-c', '${CAROL}', 'Club')`,
		`INSERT INTO user_book_tags (user_book_id, tag_id) VALUES
			('ub-a-dune', 'tag-a'),
			('ub-b-dune', 'tag-b-pareja'),
			('ub-b-emma', 'tag-b-club'),
			('ub-c-ulises', 'tag-c')`,
		`INSERT INTO groups (id, name, created_by) VALUES
			('grp-pareja', 'Pareja', '${ALICE}'),
			('grp-club', 'Club', '${BOB}')`,
		`INSERT INTO group_members (group_id, user_id, role) VALUES
			('grp-pareja', '${ALICE}', 'owner'), ('grp-pareja', '${BOB}', 'member'),
			('grp-club', '${BOB}', 'owner'), ('grp-club', '${ALICE}', 'member'), ('grp-club', '${CAROL}', 'member')`,
		`INSERT INTO shared_tags (id, tag_id, group_id, shared_by) VALUES
			('st-a', 'tag-a', 'grp-pareja', '${ALICE}'),
			('st-b1', 'tag-b-pareja', 'grp-pareja', '${BOB}'),
			('st-b2', 'tag-b-club', 'grp-club', '${BOB}'),
			('st-c', 'tag-c', 'grp-club', '${CAROL}')`,
		// Bob también tiene una película con su etiqueta del Club
		`INSERT INTO user_movies (id, user_id, library_id, title, format) VALUES
			('um-b-alien', '${BOB}', 'lib-b', 'Alien', 'dvd')`,
		`INSERT INTO user_movie_tags (user_movie_id, tag_id) VALUES ('um-b-alien', 'tag-b-club')`
	];
	await holder.tdb.asSuperuser(async (tx) => {
		for (const stmt of seed) await tx.execute(stmt as string);
	});
});
afterEach(() => holder.tdb.cleanup());

describe('getGroupBooks', () => {
	it('solo los libros compartidos en ese grupo, sin los propios', async () => {
		const pareja = await getGroupBooks(ALICE, 'grp-pareja');
		expect(pareja.map((b) => b.userBookId)).toEqual(['ub-b-dune']);

		const club = await getGroupBooks(ALICE, 'grp-club');
		expect(club.map((b) => b.userBookId)).toEqual(['ub-b-emma', 'ub-c-ulises']);
		expect(club.map((b) => b.ownerName)).toEqual(['Bob', 'Carol']);
	});

	it('solo muestra las etiquetas compartidas en ese grupo', async () => {
		const [dune] = await getGroupBooks(ALICE, 'grp-pareja');
		expect(dune.tags.map((t) => t.id)).toEqual(['tag-b-pareja']);
	});

	it('nada si no eres miembro del grupo', async () => {
		expect(await getGroupBooks(CAROL, 'grp-pareja')).toEqual([]);
	});
});

describe('searchBooksFromOthers', () => {
	it('busca en todos los grupos del usuario, sin los propios', async () => {
		const results = await searchBooksFromOthers(ALICE, 'dune');
		expect(results.map((b) => b.userBookId)).toEqual(['ub-b-dune']);
	});

	it('sin texto ni etiquetas, todo lo compartido por otros, por título', async () => {
		const results = await searchBooksFromOthers(ALICE, '');
		expect(results.map((b) => b.userBookId)).toEqual(['ub-b-dune', 'ub-b-emma', 'ub-c-ulises']);
		expect(await searchBooksFromOthers(ALICE, '', [], 2)).toHaveLength(2);
	});

	it('las etiquetas para filtrar son solo las de otros (las propias no darían nada)', async () => {
		const tags = await getSharedTagsForUser(ALICE);
		expect(tags.map((t) => t.id).sort()).toEqual(['tag-b-club', 'tag-b-pareja', 'tag-c']);
	});

	it('filtra por etiqueta sin texto', async () => {
		const results = await searchBooksFromOthers(ALICE, '', ['tag-c']);
		expect(results.map((b) => b.userBookId)).toEqual(['ub-c-ulises']);
	});
});

describe('qué se comparte en cada grupo', () => {
	it('cuenta libros y películas de otros por grupo', async () => {
		expect(await getGroupItemCounts(ALICE)).toEqual({
			'grp-pareja': { books: 1, movies: 0 },
			'grp-club': { books: 2, movies: 1 }
		});
		// Carol no está en Pareja: solo ve el Club, y sin sus propios libros
		expect(await getGroupItemCounts(CAROL)).toEqual({ 'grp-club': { books: 1, movies: 1 } });
	});

	it('tus etiquetas, con cuántos libros y películas enseñarías al compartirlas', async () => {
		const mine = await getUserTagsForGroup(BOB, 'grp-club');
		expect(mine).toEqual([
			expect.objectContaining({
				id: 'tag-b-club',
				bookCount: 1,
				movieCount: 1,
				alreadyShared: true
			}),
			expect.objectContaining({
				id: 'tag-b-pareja',
				bookCount: 1,
				movieCount: 0,
				alreadyShared: false
			})
		]);
	});

	it('con qué grupos se comparten unas etiquetas propias', async () => {
		expect(await getTagGroupShares(BOB, ['tag-b-club', 'tag-b-pareja'])).toEqual([
			{ tagId: 'tag-b-club', groupId: 'grp-club', groupName: 'Club' },
			{ tagId: 'tag-b-pareja', groupId: 'grp-pareja', groupName: 'Pareja' }
		]);
		// Las de otro no cuentan aunque Alice las vea
		expect(await getTagGroupShares(ALICE, ['tag-b-club'])).toEqual([]);
	});
});

describe('orden alfabético', () => {
	it('tus etiquetas, sin importar mayúsculas ni acentos', async () => {
		await holder.tdb.asSuperuser((tx) =>
			tx.execute(
				`INSERT INTO tags (id, user_id, name) VALUES ('t1', '${BOB}', 'zoo'), ('t2', '${BOB}', 'Árboles'), ('t3', '${BOB}', 'bosque')` as string
			)
		);
		const names = (await getUserTagsForGroup(BOB, 'grp-club')).map((t) => t.name);
		expect(names).toEqual(['Árboles', 'bosque', 'Club', 'Para Alice', 'zoo']);
	});

	it('las compartidas en el grupo, por etiqueta y luego por dueño', async () => {
		const shared = await getSharedTagsInGroup(ALICE, 'grp-club');
		expect(shared.map((t) => `${t.tagName}/${t.ownerName}`)).toEqual(['Club/Bob', 'Club/Carol']);
	});
});

describe('deleteGroup', () => {
	async function count(sql: string): Promise<number> {
		const res = await holder.tdb.asSuperuser((tx) => tx.execute(sql as string));
		return Number((res.rows[0] as { n: number }).n);
	}

	it('el owner lo borra: se van miembros y etiquetas compartidas, no los libros ni las etiquetas', async () => {
		expect(await deleteGroup(BOB, 'grp-club')).toBe(true);

		expect(await count(`SELECT count(*)::int AS n FROM groups WHERE id = 'grp-club'`)).toBe(0);
		expect(
			await count(`SELECT count(*)::int AS n FROM group_members WHERE group_id = 'grp-club'`)
		).toBe(0);
		expect(
			await count(`SELECT count(*)::int AS n FROM shared_tags WHERE group_id = 'grp-club'`)
		).toBe(0);
		expect(await count(`SELECT count(*)::int AS n FROM user_books`)).toBe(4);
		expect(await count(`SELECT count(*)::int AS n FROM user_movies`)).toBe(1);
		expect(await count(`SELECT count(*)::int AS n FROM tags`)).toBe(4);
		// Alice deja de ver «Emma» y «Ulises», que solo se compartían ahí
		expect(await getGroupItemCounts(ALICE)).toEqual({ 'grp-pareja': { books: 1, movies: 0 } });
	});

	it('ni un miembro ni un admin pueden borrarlo', async () => {
		await holder.tdb.asSuperuser((tx) =>
			tx.execute(
				`UPDATE group_members SET role = 'admin' WHERE group_id = 'grp-club' AND user_id = '${CAROL}'` as string
			)
		);
		expect(await deleteGroup(ALICE, 'grp-club')).toBe(false);
		expect(await deleteGroup(CAROL, 'grp-club')).toBe(false);
		expect(await count(`SELECT count(*)::int AS n FROM groups WHERE id = 'grp-club'`)).toBe(1);
	});

	it('cuenta todo lo compartido en el grupo, también lo propio', async () => {
		const all = await getGroupItemCounts(BOB, { includeOwn: true });
		expect(all['grp-club']).toEqual({ books: 2, movies: 1 });
	});
});
