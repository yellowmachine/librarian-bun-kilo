import { error, fail } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { eq, and, inArray } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { getUserBook, updateUserBook, removeFromLibrary } from '$lib/server/books';
import { withRLS } from '$lib/server/db/rls';
import { tags, userBookTags, loans } from '$lib/server/db/schema';
import {
	getMyReview,
	getBookReviews,
	getBookReviewStats,
	upsertReview,
	deleteReview
} from '$lib/server/reviews';

export const load = async ({ locals, params }: RequestEvent) => {
	const book = await getUserBook(locals.user!.id, params.id!);
	if (!book) error(404, 'Libro no encontrado en tu biblioteca');

	const [userTags, myReview, reviews, reviewStats] = await Promise.all([
		withRLS(locals.user!.id, (tx) =>
			tx.select().from(tags).where(eq(tags.userId, locals.user!.id))
		),
		getMyReview(locals.user!.id, book.bookId),
		getBookReviews(locals.user!.id, book.bookId),
		getBookReviewStats(locals.user!.id, book.bookId)
	]);

	return { book, userTags, myReview, reviews, reviewStats };
};

export const actions = {
	// Actualizar notas y disponibilidad
	update: async ({ locals, params, request }: RequestEvent) => {
		const data = await request.formData();
		const notes = data.get('notes') as string | null;
		const isAvailable = data.get('isAvailable') === 'true';

		await updateUserBook(locals.user!.id, params.id!, {
			notes: notes ?? undefined,
			isAvailable
		});

		return { success: true };
	},

	// Crear etiqueta nueva y asignarla al libro
	createTag: async ({ locals, params, request }: RequestEvent) => {
		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();
		const color = (data.get('color') as string)?.trim() || null;

		if (!name) return fail(400, { error: 'El nombre es obligatorio' });

		const tagId = nanoid();
		await withRLS(locals.user!.id, async (tx) => {
			await tx.insert(tags).values({ id: tagId, userId: locals.user!.id, name, color });
			await tx.insert(userBookTags).values({ userBookId: params.id!, tagId });
		});

		return { success: true };
	},

	// Asignar etiqueta existente al libro
	addTag: async ({ locals, params, request }: RequestEvent) => {
		const data = await request.formData();
		const tagId = data.get('tagId') as string;
		if (!tagId) return fail(400, { error: 'tagId requerido' });

		await withRLS(locals.user!.id, (tx) =>
			tx.insert(userBookTags).values({ userBookId: params.id!, tagId }).onConflictDoNothing()
		);
		return { success: true };
	},

	// Quitar etiqueta del libro
	removeTag: async ({ locals, params, request }: RequestEvent) => {
		const data = await request.formData();
		const tagId = data.get('tagId') as string;
		if (!tagId) return fail(400, { error: 'tagId requerido' });

		await withRLS(locals.user!.id, (tx) =>
			tx
				.delete(userBookTags)
				.where(and(eq(userBookTags.userBookId, params.id!), eq(userBookTags.tagId, tagId)))
		);
		return { success: true };
	},

	// Guardar (crear o actualizar) reseña propia
	saveReview: async ({ locals, params, request }: RequestEvent) => {
		const book = await getUserBook(locals.user!.id, params.id!);
		if (!book) return fail(404, { reviewError: 'Libro no encontrado' });

		const data = await request.formData();
		const ratingRaw = data.get('rating') as string;
		const body = (data.get('body') as string | null)?.trim() || undefined;

		const rating = parseInt(ratingRaw, 10);
		if (!rating || rating < 1 || rating > 5) {
			return fail(400, { reviewError: 'La puntuación debe ser entre 1 y 5 estrellas' });
		}

		try {
			await upsertReview(locals.user!.id, book.bookId, { rating, body });
		} catch (e) {
			return fail(400, { reviewError: e instanceof Error ? e.message : 'Error al guardar' });
		}

		return { reviewSaved: true };
	},

	// Eliminar reseña propia
	deleteReview: async ({ locals, params }: RequestEvent) => {
		const book = await getUserBook(locals.user!.id, params.id!);
		if (!book) return fail(404, { reviewError: 'Libro no encontrado' });

		await deleteReview(locals.user!.id, book.bookId);
		return { reviewDeleted: true };
	},

	// Eliminar libro de la biblioteca
	remove: async ({ locals, params }: RequestEvent) => {
		// Verificar que no hay préstamos activos antes de eliminar
		// (la FK onDelete:restrict lanzaría un error de DB sin este guard)
		const activeLoans = await withRLS(locals.user!.id, (tx) =>
			tx
				.select({ id: loans.id })
				.from(loans)
				.where(
					and(
						eq(loans.userBookId, params.id!),
						inArray(loans.status, ['requested', 'accepted', 'active', 'return_requested'])
					)
				)
		);

		if (activeLoans.length > 0) {
			return fail(400, {
				error: 'No puedes eliminar este libro porque tiene un préstamo en curso.'
			});
		}

		await removeFromLibrary(locals.user!.id, params.id!);
		return { removed: true };
	}
};
