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
	getExportData,
	serializeExportYaml,
	serializeExportJson,
	serializeExportBibTex
} from '../export';

const ALICE = 'user-alice';
const BOB = 'user-bob';

beforeEach(async () => {
	holder.tdb = await createTestDb();
	// Alice: «Casa» (predeterminada) con «Dune» y «Alien», y «Oficina» vacía.
	// Bob comparte «Emma» con el grupo de los dos: no es de Alice y no se exporta.
	const seed = [
		`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES
			('${ALICE}', 'Alice', 'alice@test.com', true, now(), now()),
			('${BOB}', 'Bob', 'bob@test.com', true, now(), now())`,
		`INSERT INTO books (id, title, authors) VALUES ('OL1', 'Dune', '{Frank Herbert}')`,
		`INSERT INTO libraries (id, user_id, name, is_default) VALUES
			('lib-casa', '${ALICE}', 'Casa', true),
			('lib-oficina', '${ALICE}', 'Oficina', false),
			('lib-bob', '${BOB}', 'Default', true)`,
		`INSERT INTO user_books (id, user_id, library_id, book_id, notes, added_at) VALUES
			('ub-dune', '${ALICE}', 'lib-casa', 'OL1', 'Firmado: "F. H."', '2026-01-02')`,
		`INSERT INTO user_books (id, user_id, library_id, title, authors, notes) VALUES
			('ub-emma', '${BOB}', 'lib-bob', 'Emma', '{Jane Austen}', 'Nota de Bob')`,
		`INSERT INTO user_movies (id, user_id, library_id, title, format, added_at) VALUES
			('um-alien', '${ALICE}', 'lib-casa', 'Alien', 'bluray', '2026-02-03')`,
		`INSERT INTO tags (id, user_id, name) VALUES ('t-sf', '${ALICE}', 'Ciencia ficción'), ('t-bob', '${BOB}', 'Club')`,
		`INSERT INTO user_book_tags (user_book_id, tag_id) VALUES ('ub-dune', 't-sf'), ('ub-emma', 't-bob')`,
		`INSERT INTO user_movie_tags (user_movie_id, tag_id) VALUES ('um-alien', 't-sf')`,
		`INSERT INTO book_reviews (id, book_id, user_id, rating) VALUES ('r1', 'OL1', '${ALICE}', 5)`,
		`INSERT INTO groups (id, name, created_by) VALUES ('grp', 'Club', '${BOB}')`,
		`INSERT INTO group_members (group_id, user_id, role) VALUES ('grp', '${BOB}', 'owner'), ('grp', '${ALICE}', 'member')`,
		`INSERT INTO shared_tags (id, tag_id, group_id, shared_by) VALUES ('st', 't-bob', 'grp', '${BOB}')`
	];
	await holder.tdb.asSuperuser(async (tx) => {
		for (const stmt of seed) await tx.execute(stmt as string);
	});
});
afterEach(() => holder.tdb.cleanup());

describe('getExportData', () => {
	it('todas las bibliotecas, la predeterminada primero, con sus libros y películas', async () => {
		const data = await getExportData(ALICE);
		expect(data.map((l) => [l.name, l.books.length, l.movies.length])).toEqual([
			['Casa', 1, 1],
			['Oficina', 0, 0]
		]);
		expect(data[0].books[0]).toMatchObject({
			title: 'Dune',
			authors: ['Frank Herbert'],
			rating: 5,
			notes: 'Firmado: "F. H."',
			tags: ['Ciencia ficción']
		});
		expect(data[0].movies[0]).toMatchObject({
			title: 'Alien',
			format: 'bluray',
			tags: ['Ciencia ficción']
		});
	});

	it('solo lo propio: no lo que otros comparten con uno', async () => {
		const books = (await getExportData(ALICE)).flatMap((l) => l.books.map((b) => b.title));
		expect(books).toEqual(['Dune']);
	});
});

describe('formatos', () => {
	const at = new Date('2026-11-17T10:00:00Z');

	it('YAML por bibliotecas, con las comillas escapadas', async () => {
		const yaml = serializeExportYaml(await getExportData(ALICE), at);
		expect(yaml).toContain(
			'exported_at: 2026-11-17T10:00:00.000Z\nlibraries:\n  - name: Casa\n    default: true\n    books:\n      - title: Dune'
		);
		expect(yaml).toContain('notes: "Firmado: \\"F. H.\\""');
		expect(yaml).toContain('added: 2026-01-02');
		expect(yaml).toContain('  - name: Oficina\n    books: []\n    movies: []');
	});

	it('JSON con la misma estructura', async () => {
		const json = JSON.parse(serializeExportJson(await getExportData(ALICE), at));
		expect(json.exportedAt).toBe('2026-11-17T10:00:00.000Z');
		expect(json.libraries[0].books[0].title).toBe('Dune');
	});

	it('BibTeX solo con los libros', async () => {
		const bib = serializeExportBibTex(await getExportData(ALICE));
		expect(bib).toContain('@book{herbert');
		expect(bib).not.toContain('Alien');
		expect(serializeExportBibTex([])).toBe('% Empty library\n');
	});
});
