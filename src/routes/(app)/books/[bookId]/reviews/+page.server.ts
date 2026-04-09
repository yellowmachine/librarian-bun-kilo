import { error, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { books } from '$lib/server/db/schema';
import {
	getMyReview,
	getBookReviews,
	getBookReviewStats,
	upsertReview,
	deleteReview
} from '$lib/server/reviews';

export const load = async ({ locals, params }: RequestEvent) => {
	// El catálogo de libros es global, no requiere RLS para la consulta
	const bookRows = await db.select().from(books).where(eq(books.id, params.bookId!));
	if (bookRows.length === 0) error(404, 'Libro no encontrado');

	const book = bookRows[0];

	const [myReview, reviews, reviewStats] = await Promise.all([
		getMyReview(locals.user!.id, book.id),
		getBookReviews(locals.user!.id, book.id),
		getBookReviewStats(locals.user!.id, book.id)
	]);

	return { book, myReview, reviews, reviewStats };
};

export const actions = {
	saveReview: async ({ locals, params, request }: RequestEvent) => {
		const data = await request.formData();
		const ratingRaw = data.get('rating') as string;
		const body = (data.get('body') as string | null)?.trim() || undefined;

		const rating = parseInt(ratingRaw, 10);
		if (!rating || rating < 1 || rating > 5) {
			return fail(400, { reviewError: 'La puntuación debe ser entre 1 y 5 estrellas' });
		}

		try {
			await upsertReview(locals.user!.id, params.bookId!, { rating, body });
		} catch (e) {
			return fail(400, { reviewError: e instanceof Error ? e.message : 'Error al guardar' });
		}

		return { reviewSaved: true };
	},

	deleteReview: async ({ locals, params }: RequestEvent) => {
		await deleteReview(locals.user!.id, params.bookId!);
		return { reviewDeleted: true };
	}
};
