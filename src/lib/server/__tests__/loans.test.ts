import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../db/test-db';

// loans.ts usa la conexión real (db/index) y withRLS (db/rls): se redirigen a
// una base PGlite en memoria por test. Los emails no se mandan.
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
	requestLoan,
	transitionLoan,
	getUserLoans,
	getLoan,
	getMovieForBorrow,
	getPendingCount
} from '../loans';
import { sendLoanRequestEmail } from '../email';
import { removeMovie, OPEN_LOAN_ERROR as MOVIE_OPEN_LOAN } from '../movies';
import { removeFromLibrary, OPEN_LOAN_ERROR as BOOK_OPEN_LOAN } from '../books';

const ALICE = 'user-alice';
const BOB = 'user-bob';
const CAROL = 'user-carol';
const MOVIE = { kind: 'movie' as const, userMovieId: 'um-bob' };
const BOOK = { kind: 'book' as const, userBookId: 'ub-bob' };

// Bob tiene un libro y una película con su etiqueta «Club», compartida con el
// grupo de Alice y Bob. Carol no está en el grupo.
beforeEach(async () => {
	holder.tdb = await createTestDb();
	const seed = [
		`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('${ALICE}', 'Alice', 'alice@test.com', true, now(), now()), ('${BOB}', 'Bob', 'bob@test.com', true, now(), now()), ('${CAROL}', 'Carol', 'carol@test.com', true, now(), now())`,
		`INSERT INTO books (id, title, authors) VALUES ('OL1', 'Dune', '{"Frank Herbert"}')`,
		`INSERT INTO movies (id, title, directors, poster_url) VALUES ('tmdb-78', 'Blade Runner', '{"Ridley Scott"}', 'https://image.tmdb.org/t/p/w500/a.jpg')`,
		`INSERT INTO libraries (id, user_id, name, is_default) VALUES ('lib-bob', '${BOB}', 'Default', true)`,
		`INSERT INTO user_books (id, user_id, library_id, book_id) VALUES ('ub-bob', '${BOB}', 'lib-bob', 'OL1')`,
		`INSERT INTO user_movies (id, user_id, library_id, movie_id, format) VALUES ('um-bob', '${BOB}', 'lib-bob', 'tmdb-78', 'bluray')`,
		`INSERT INTO tags (id, user_id, name) VALUES ('tag-bob', '${BOB}', 'Club')`,
		`INSERT INTO user_book_tags (user_book_id, tag_id) VALUES ('ub-bob', 'tag-bob')`,
		`INSERT INTO user_movie_tags (user_movie_id, tag_id) VALUES ('um-bob', 'tag-bob')`,
		`INSERT INTO groups (id, name, created_by) VALUES ('grp', 'Club', '${BOB}')`,
		`INSERT INTO group_members (group_id, user_id, role) VALUES ('grp', '${BOB}', 'owner'), ('grp', '${ALICE}', 'member')`,
		`INSERT INTO shared_tags (id, tag_id, group_id, shared_by) VALUES ('st', 'tag-bob', 'grp', '${BOB}')`
	];
	await holder.tdb.asSuperuser(async (tx) => {
		for (const stmt of seed) await tx.execute(stmt as string);
	});
});
afterEach(() => {
	holder.tdb.cleanup();
	vi.clearAllMocks();
});

async function isMovieAvailable(): Promise<boolean> {
	const res = await holder.tdb.asSuperuser((tx) =>
		tx.execute(`SELECT is_available FROM user_movies WHERE id = 'um-bob'` as string)
	);
	return (res.rows[0] as { is_available: boolean }).is_available;
}

describe('préstamos de películas', () => {
	it('recorre el préstamo entero y la disponibilidad acompaña', async () => {
		const loanId = await requestLoan(ALICE, MOVIE, '¿Me la dejas el finde?');
		expect(sendLoanRequestEmail).toHaveBeenCalledWith(
			expect.objectContaining({ to: 'bob@test.com', bookTitle: 'Blade Runner' })
		);

		const loan = await getLoan(BOB, loanId);
		expect(loan).toMatchObject({
			itemKind: 'movie',
			itemHref: '/movies/um-bob',
			userMovieId: 'um-bob',
			userBookId: null,
			title: 'Blade Runner',
			authors: ['Ridley Scott'],
			coverUrl: 'https://image.tmdb.org/t/p/w500/a.jpg',
			ownerName: 'Bob',
			borrowerName: 'Alice'
		});
		expect(await getPendingCount(BOB)).toBe(1);

		expect(await transitionLoan(BOB, loanId, 'accepted')).toEqual({ success: true });
		expect(await transitionLoan(BOB, loanId, 'active')).toEqual({ success: true });
		expect(await isMovieAvailable()).toBe(false);

		expect(await transitionLoan(ALICE, loanId, 'return_requested')).toEqual({ success: true });
		expect(await transitionLoan(BOB, loanId, 'returned')).toEqual({ success: true });
		expect(await isMovieAvailable()).toBe(true);
	});

	it('quien la pidió sigue viéndola en sus préstamos', async () => {
		const loanId = await requestLoan(ALICE, MOVIE);
		const { asBorrower } = await getUserLoans(ALICE);
		expect(asBorrower.map((l) => [l.id, l.title, l.itemKind])).toEqual([
			[loanId, 'Blade Runner', 'movie']
		]);
	});

	it('no se puede pedir la propia, una no compartida, ni dos veces', async () => {
		await expect(requestLoan(BOB, MOVIE)).rejects.toThrow("You can't request your own movie.");
		await expect(requestLoan(CAROL, MOVIE)).rejects.toThrow('Movie not found');

		await requestLoan(ALICE, MOVIE);
		await expect(requestLoan(ALICE, MOVIE)).rejects.toThrow(
			'There is already an active request for this movie.'
		);
	});

	it('getMovieForBorrow: disponibilidad y petición abierta', async () => {
		expect(await getMovieForBorrow(BOB, 'um-bob')).toBeNull(); // es suya
		expect(await getMovieForBorrow(CAROL, 'um-bob')).toBeNull(); // no la ve

		expect(await getMovieForBorrow(ALICE, 'um-bob')).toMatchObject({
			isAvailable: true,
			existingLoanId: null
		});
		const loanId = await requestLoan(ALICE, MOVIE);
		expect(await getMovieForBorrow(ALICE, 'um-bob')).toMatchObject({
			existingLoanId: loanId,
			existingLoanStatus: 'requested'
		});
	});
});

describe('préstamos de libros (sin cambios)', () => {
	it('siguen funcionando y se listan junto a las películas', async () => {
		const bookLoan = await requestLoan(ALICE, BOOK);
		const movieLoan = await requestLoan(ALICE, MOVIE);

		const { asOwner } = await getUserLoans(BOB);
		const byId = new Map(asOwner.map((l) => [l.id, l]));
		expect(byId.get(bookLoan)).toMatchObject({
			itemKind: 'book',
			itemHref: '/library/ub-bob',
			title: 'Dune',
			authors: ['Frank Herbert']
		});
		expect(byId.get(movieLoan)?.itemKind).toBe('movie');

		await transitionLoan(BOB, bookLoan, 'accepted');
		await transitionLoan(BOB, bookLoan, 'active');
		const res = await holder.tdb.asSuperuser((tx) =>
			tx.execute(`SELECT is_available FROM user_books WHERE id = 'ub-bob'` as string)
		);
		expect((res.rows[0] as { is_available: boolean }).is_available).toBe(false);
		// La película no se toca
		expect(await isMovieAvailable()).toBe(true);
	});
});

describe('borrar una copia que se ha prestado', () => {
	async function finishLoan(loanId: string) {
		await transitionLoan(BOB, loanId, 'accepted');
		await transitionLoan(BOB, loanId, 'active');
		await transitionLoan(ALICE, loanId, 'return_requested');
		await transitionLoan(BOB, loanId, 'returned');
	}

	it('no se puede con el préstamo en curso', async () => {
		const movieLoan = await requestLoan(ALICE, MOVIE);
		const bookLoan = await requestLoan(ALICE, BOOK);
		await expect(removeMovie(BOB, 'um-bob')).rejects.toThrow(MOVIE_OPEN_LOAN);
		await expect(removeFromLibrary(BOB, 'ub-bob')).rejects.toThrow(BOOK_OPEN_LOAN);

		await transitionLoan(BOB, movieLoan, 'accepted');
		await transitionLoan(BOB, movieLoan, 'active');
		await expect(removeMovie(BOB, 'um-bob')).rejects.toThrow(MOVIE_OPEN_LOAN);
		expect(await getLoan(BOB, bookLoan)).not.toBeNull();
	});

	it('terminado, se borra y el préstamo queda en el historial de los dos', async () => {
		const movieLoan = await requestLoan(ALICE, MOVIE);
		const bookLoan = await requestLoan(ALICE, BOOK);
		await finishLoan(movieLoan);
		await finishLoan(bookLoan);

		await removeMovie(BOB, 'um-bob');
		await removeFromLibrary(BOB, 'ub-bob');

		for (const viewer of [ALICE, BOB]) {
			const movie = await getLoan(viewer, movieLoan);
			expect(movie).toMatchObject({
				status: 'returned',
				itemKind: 'movie',
				itemHref: null,
				userMovieId: null,
				title: 'Blade Runner',
				authors: ['Ridley Scott'],
				coverUrl: 'https://image.tmdb.org/t/p/w500/a.jpg'
			});
			const book = await getLoan(viewer, bookLoan);
			expect(book).toMatchObject({
				itemKind: 'book',
				itemHref: null,
				title: 'Dune',
				authors: ['Frank Herbert']
			});
		}
		const { asBorrower } = await getUserLoans(ALICE);
		expect(asBorrower.map((l) => l.title).sort()).toEqual(['Blade Runner', 'Dune']);
	});

	it('mientras la copia existe, se ven sus datos actuales, no los del momento del préstamo', async () => {
		const loanId = await requestLoan(ALICE, BOOK);
		await holder.tdb.asSuperuser((tx) =>
			tx.execute(`UPDATE user_books SET title = 'Dune (corregido)' WHERE id = 'ub-bob'` as string)
		);
		expect((await getLoan(BOB, loanId))?.title).toBe('Dune (corregido)');
	});
});
