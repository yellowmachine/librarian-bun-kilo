// Reseñas de películas del catálogo (movies), como reviews.ts para libros:
// una por usuario y película, visibles para todos.
import { nanoid } from 'nanoid';
import { eq, and, desc, avg, count } from 'drizzle-orm';
import { movieReviews } from './db/schema';
import { user } from './db/auth.schema';
import { withRLS } from './db/rls';

export type MovieReview = {
	id: string;
	movieId: string;
	userId: string;
	userName: string;
	rating: number;
	body: string | null;
	createdAt: Date;
	updatedAt: Date;
};

export type MovieReviewStats = {
	averageRating: number | null;
	totalReviews: number;
};

const reviewColumns = {
	id: movieReviews.id,
	movieId: movieReviews.movieId,
	userId: movieReviews.userId,
	userName: user.name,
	rating: movieReviews.rating,
	body: movieReviews.body,
	createdAt: movieReviews.createdAt,
	updatedAt: movieReviews.updatedAt
};

/** Todas las reseñas de una película, de la más reciente a la más antigua, y sus números. */
export async function getMovieReviews(
	userId: string,
	movieId: string
): Promise<{ reviews: MovieReview[]; myReview: MovieReview | null; stats: MovieReviewStats }> {
	return withRLS(userId, async (tx) => {
		const reviews = await tx
			.select(reviewColumns)
			.from(movieReviews)
			.innerJoin(user, eq(movieReviews.userId, user.id))
			.where(eq(movieReviews.movieId, movieId))
			.orderBy(desc(movieReviews.createdAt));

		const [row] = await tx
			.select({ averageRating: avg(movieReviews.rating), totalReviews: count(movieReviews.id) })
			.from(movieReviews)
			.where(eq(movieReviews.movieId, movieId));

		return {
			reviews,
			myReview: reviews.find((r) => r.userId === userId) ?? null,
			stats: {
				averageRating: row?.averageRating != null ? Number(row.averageRating) : null,
				totalReviews: Number(row?.totalReviews ?? 0)
			}
		};
	});
}

/** Crea o actualiza la reseña propia. */
export async function upsertMovieReview(
	userId: string,
	movieId: string,
	data: { rating: number; body?: string }
): Promise<void> {
	if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5) {
		throw new Error('The rating must be between 1 and 5 stars.');
	}
	const body = data.body?.trim().slice(0, 5000) || null;

	await withRLS(userId, async (tx) => {
		await tx
			.insert(movieReviews)
			.values({ id: nanoid(), movieId, userId, rating: data.rating, body })
			.onConflictDoUpdate({
				target: [movieReviews.movieId, movieReviews.userId],
				set: { rating: data.rating, body, updatedAt: new Date() }
			});
	});
}

export async function deleteMovieReview(userId: string, movieId: string): Promise<void> {
	await withRLS(userId, async (tx) => {
		await tx
			.delete(movieReviews)
			.where(and(eq(movieReviews.movieId, movieId), eq(movieReviews.userId, userId)));
	});
}
