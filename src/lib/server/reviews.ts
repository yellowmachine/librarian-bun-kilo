import { nanoid } from 'nanoid';
import { eq, and, desc, avg, count, inArray } from 'drizzle-orm';
import { bookReviews } from './db/schema';
import { withRLS } from './db/rls';
import { user } from './db/auth.schema';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type BookReview = {
	id: string;
	bookId: string;
	userId: string;
	userName: string;
	rating: number;
	body: string | null;
	createdAt: Date;
	updatedAt: Date;
};

export type BookReviewStats = {
	averageRating: number | null;
	totalReviews: number;
};

// ─── Obtener la reseña propia del usuario para un libro ───────────────────────

export async function getMyReview(userId: string, bookId: string): Promise<BookReview | null> {
	return withRLS(userId, async (tx) => {
		const rows = await tx
			.select({
				id: bookReviews.id,
				bookId: bookReviews.bookId,
				userId: bookReviews.userId,
				userName: user.name,
				rating: bookReviews.rating,
				body: bookReviews.body,
				createdAt: bookReviews.createdAt,
				updatedAt: bookReviews.updatedAt
			})
			.from(bookReviews)
			.innerJoin(user, eq(bookReviews.userId, user.id))
			.where(and(eq(bookReviews.bookId, bookId), eq(bookReviews.userId, userId)));

		return rows[0] ?? null;
	});
}

// ─── Obtener todas las reseñas de un libro (visibles para el usuario) ─────────

export async function getBookReviews(userId: string, bookId: string): Promise<BookReview[]> {
	return withRLS(userId, async (tx) => {
		return tx
			.select({
				id: bookReviews.id,
				bookId: bookReviews.bookId,
				userId: bookReviews.userId,
				userName: user.name,
				rating: bookReviews.rating,
				body: bookReviews.body,
				createdAt: bookReviews.createdAt,
				updatedAt: bookReviews.updatedAt
			})
			.from(bookReviews)
			.innerJoin(user, eq(bookReviews.userId, user.id))
			.where(eq(bookReviews.bookId, bookId))
			.orderBy(desc(bookReviews.createdAt));
	});
}

// ─── Estadísticas de un libro (media y total de reseñas) ──────────────────────
// Se ejecuta sin RLS porque book_reviews.select = true para todos los app_user.

export async function getBookReviewStats(userId: string, bookId: string): Promise<BookReviewStats> {
	return withRLS(userId, async (tx) => {
		const rows = await tx
			.select({
				averageRating: avg(bookReviews.rating),
				totalReviews: count(bookReviews.id)
			})
			.from(bookReviews)
			.where(eq(bookReviews.bookId, bookId));

		const row = rows[0];
		return {
			averageRating: row?.averageRating != null ? Number(row.averageRating) : null,
			totalReviews: Number(row?.totalReviews ?? 0)
		};
	});
}

// ─── Crear o actualizar reseña propia ─────────────────────────────────────────

export async function upsertReview(
	userId: string,
	bookId: string,
	data: { rating: number; body?: string }
): Promise<string> {
	if (data.rating < 1 || data.rating > 5) {
		throw new Error('La puntuación debe estar entre 1 y 5');
	}

	return withRLS(userId, async (tx) => {
		// Comprobar si ya existe una reseña del usuario para este libro
		const existing = await tx
			.select({ id: bookReviews.id })
			.from(bookReviews)
			.where(and(eq(bookReviews.bookId, bookId), eq(bookReviews.userId, userId)));

		if (existing.length > 0) {
			// Actualizar
			await tx
				.update(bookReviews)
				.set({
					rating: data.rating,
					body: data.body?.trim() || null,
					updatedAt: new Date()
				})
				.where(eq(bookReviews.id, existing[0].id));

			return existing[0].id;
		}

		// Insertar
		const id = nanoid();
		await tx.insert(bookReviews).values({
			id,
			bookId,
			userId,
			rating: data.rating,
			body: data.body?.trim() || null
		});

		return id;
	});
}

// ─── Eliminar reseña propia ───────────────────────────────────────────────────

export async function deleteReview(userId: string, bookId: string): Promise<void> {
	await withRLS(userId, async (tx) => {
		await tx
			.delete(bookReviews)
			.where(and(eq(bookReviews.bookId, bookId), eq(bookReviews.userId, userId)));
	});
}

// ─── Obtener reseñas de múltiples libros (para listados) ──────────────────────
// Útil para mostrar la media en tarjetas de libro sin N+1 queries.

export async function getReviewStatsForBooks(
	userId: string,
	bookIds: string[]
): Promise<Map<string, BookReviewStats>> {
	if (bookIds.length === 0) return new Map();

	return withRLS(userId, async (tx) => {
		const rows = await tx
			.select({
				bookId: bookReviews.bookId,
				averageRating: avg(bookReviews.rating),
				totalReviews: count(bookReviews.id)
			})
			.from(bookReviews)
			.where(inArray(bookReviews.bookId, bookIds))
			.groupBy(bookReviews.bookId);

		const map = new Map<string, BookReviewStats>();
		for (const row of rows) {
			map.set(row.bookId, {
				averageRating: row.averageRating != null ? Number(row.averageRating) : null,
				totalReviews: Number(row.totalReviews)
			});
		}
		return map;
	});
}
