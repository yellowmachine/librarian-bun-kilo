import { describe, it, expect, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../test-db';

// 0007_loan_snapshots rellena loans.item_* para los préstamos que ya había,
// sacándolo de su libro o película. Se prueba con una base migrada hasta 0006
// y préstamos creados como antes (sin item_*).

describe('migración 0007_loan_snapshots', () => {
	let tdb: TestDb;
	afterEach(() => tdb.cleanup());

	it('rellena qué es, título, autores/directores y portada pública', async () => {
		tdb = await createTestDb({ stopBefore: '0007_loan_snapshots' });
		const before = [
			`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('a', 'Alice', 'a@test.com', true, now(), now()), ('b', 'Bob', 'b@test.com', true, now(), now())`,
			`INSERT INTO libraries (id, user_id, name, is_default) VALUES ('lib', 'b', 'Default', true)`,
			`INSERT INTO books (id, title, authors, cover_url) VALUES ('OL1', 'Dune', '{"Frank Herbert"}', 'https://covers.openlibrary.org/b/id/1-M.jpg')`,
			// Libro de catálogo con título corregido a mano por el dueño
			`INSERT INTO user_books (id, user_id, library_id, book_id, title) VALUES ('ub-1', 'b', 'lib', 'OL1', 'Dune (ed. 1965)')`,
			// Libro manual sin portada
			`INSERT INTO user_books (id, user_id, library_id, title, authors) VALUES ('ub-2', 'b', 'lib', 'Apuntes', '{"Bob"}')`,
			`INSERT INTO movies (id, title, directors, poster_url) VALUES ('tmdb-78', 'Blade Runner', '{"Ridley Scott"}', 'https://image.tmdb.org/t/p/w500/a.jpg')`,
			// Película con foto propia: esa URL no es pública y no se guarda
			`INSERT INTO user_movies (id, user_id, library_id, movie_id, format, cover_url) VALUES ('um-1', 'b', 'lib', 'tmdb-78', 'bluray', '/api/movies/um-1/cover?v=x')`,
			`INSERT INTO user_movies (id, user_id, library_id, movie_id, format) VALUES ('um-2', 'b', 'lib', 'tmdb-78', 'dvd')`,
			`INSERT INTO loans (id, user_book_id, borrower_id, owner_id, status) VALUES ('l-book', 'ub-1', 'a', 'b', 'returned'), ('l-manual', 'ub-2', 'a', 'b', 'active')`,
			`INSERT INTO loans (id, user_movie_id, borrower_id, owner_id, status) VALUES ('l-photo', 'um-1', 'a', 'b', 'requested'), ('l-poster', 'um-2', 'a', 'b', 'returned')`
		];
		await tdb.asSuperuser(async (tx) => {
			for (const stmt of before) await tx.execute(stmt as string);
		});

		await tdb.applyRemaining();

		const res = await tdb.asSuperuser((tx) =>
			tx.execute(
				`SELECT id, item_kind, item_title, item_creators, item_cover_url FROM loans ORDER BY id` as string
			)
		);
		expect(res.rows).toEqual([
			{
				id: 'l-book',
				item_kind: 'book',
				item_title: 'Dune (ed. 1965)',
				item_creators: ['Frank Herbert'],
				item_cover_url: 'https://covers.openlibrary.org/b/id/1-M.jpg'
			},
			{
				id: 'l-manual',
				item_kind: 'book',
				item_title: 'Apuntes',
				item_creators: ['Bob'],
				item_cover_url: null
			},
			{
				id: 'l-photo',
				item_kind: 'movie',
				item_title: 'Blade Runner',
				item_creators: ['Ridley Scott'],
				item_cover_url: null
			},
			{
				id: 'l-poster',
				item_kind: 'movie',
				item_title: 'Blade Runner',
				item_creators: ['Ridley Scott'],
				item_cover_url: 'https://image.tmdb.org/t/p/w500/a.jpg'
			}
		]);
	});
});
