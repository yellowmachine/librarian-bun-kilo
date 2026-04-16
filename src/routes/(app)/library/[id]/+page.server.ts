import { error, fail, redirect } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { eq, and, inArray } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { getUserBook, updateUserBook, removeFromLibrary } from '$lib/server/books';
import { withRLS } from '$lib/server/db/rls';
import { tags, userBookTags, loans, userBooks, books } from '$lib/server/db/schema';
import { getWorkById } from '$lib/server/openlibrary';
import { db } from '$lib/server/db/index';
import {
  getMyReview,
  getBookReviews,
  getBookReviewStats,
  upsertReview,
  deleteReview
} from '$lib/server/reviews';

export const load = async ({ locals, params }: RequestEvent) => {
  const book = await getUserBook(locals.user!.id, params.id!);
  if (!book) error(404, 'Book not found in your library');

  const [userTags, myReview, reviews, reviewStats] = await Promise.all([
    withRLS(locals.user!.id, (tx) =>
      tx.select().from(tags).where(eq(tags.userId, locals.user!.id))
    ),
    book.bookId ? getMyReview(locals.user!.id, book.bookId) : null,
    book.bookId ? getBookReviews(locals.user!.id, book.bookId) : [],
    book.bookId ? getBookReviewStats(locals.user!.id, book.bookId) : null
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

    if (!name) return fail(400, { error: 'Name is required' });

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
    if (!tagId) return fail(400, { error: 'tagId is required' });

    await withRLS(locals.user!.id, (tx) =>
      tx.insert(userBookTags).values({ userBookId: params.id!, tagId }).onConflictDoNothing()
    );
    return { success: true };
  },

  // Quitar etiqueta del libro
  removeTag: async ({ locals, params, request }: RequestEvent) => {
    const data = await request.formData();
    const tagId = data.get('tagId') as string;
    if (!tagId) return fail(400, { error: 'tagId is required' });

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
    if (!book) return fail(404, { reviewError: 'Book not found.' });

    const data = await request.formData();
    const ratingRaw = data.get('rating') as string;
    const body = (data.get('body') as string | null)?.trim() || undefined;

    const rating = parseInt(ratingRaw, 10);
    if (!rating || rating < 1 || rating > 5) {
      return fail(400, { reviewError: 'The rating must be between 1 and 5 stars' });
    }

    if (!book.bookId) return fail(400, { reviewError: 'Reviews are not available for manually added books.' });

    try {
      await upsertReview(locals.user!.id, book.bookId, { rating, body });
    } catch (e) {
      return fail(400, { reviewError: e instanceof Error ? e.message : 'Saving error.' });
    }

    return { reviewSaved: true };
  },

  // Eliminar reseña propia
  deleteReview: async ({ locals, params }: RequestEvent) => {
    const book = await getUserBook(locals.user!.id, params.id!);
    if (!book) return fail(404, { reviewError: 'Book not found.' });

    if (!book.bookId) return fail(400, { reviewError: 'Reviews are not available for manually added books.' });
    await deleteReview(locals.user!.id, book.bookId);
    return { reviewDeleted: true };
  },

  // Editar campos de un libro introducido manualmente (bookId IS NULL)
  editManual: async ({ locals, params, request }: RequestEvent) => {
    const book = await getUserBook(locals.user!.id, params.id!);
    if (!book) return fail(404, { editError: 'Book not found.' });
    if (book.bookId !== null) return fail(400, { editError: 'Only manually added books can be edited.' });

    const data = await request.formData();
    const title = (data.get('title') as string)?.trim();
    const authorsRaw = (data.get('authors') as string)?.trim();
    const isbn = (data.get('isbn') as string)?.trim() || null;
    const publishYearRaw = (data.get('publishYear') as string)?.trim();
    const description = (data.get('description') as string)?.trim() || null;

    if (!title) return fail(400, { editError: 'Title is required.' });

    const authors = authorsRaw ? authorsRaw.split('\n').map((a) => a.trim()).filter(Boolean) : [];
    const publishYear = publishYearRaw ? parseInt(publishYearRaw, 10) : null;

    await withRLS(locals.user!.id, async (tx) => {
      await tx
        .update(userBooks)
        .set({
          title,
          authors: authors.length > 0 ? authors : null,
          isbn: isbn || null,
          publishYear: publishYear && !isNaN(publishYear) ? publishYear : null,
          description,
          updatedAt: new Date()
        })
        .where(eq(userBooks.id, params.id!));
    });

    return { editSaved: true };
  },

  // Actualizar descripción desde OpenLibrary (solo libros con bookId)
  updateDescription: async ({ locals, params }: RequestEvent) => {
    const book = await getUserBook(locals.user!.id, params.id!);
    if (!book || !book.bookId) return fail(400, { error: 'Not an OpenLibrary book.' });

    let description: string | null = null;

    // 1. Try fresh fetch from OL Works API
    try {
      const workData = await getWorkById(book.bookId);
      description = workData?.description ?? null;
    } catch {
      // OL unreachable — fall through to catalog fallback
    }

    // 2. Fallback: description already stored in the books catalog
    if (!description) {
      const row = await db
        .select({ description: books.description })
        .from(books)
        .where(eq(books.id, book.bookId));
      description = row[0]?.description ?? null;
    }

    if (!description) {
      return fail(404, { error: 'No description available for this book on OpenLibrary.' });
    }

    await withRLS(locals.user!.id, async (tx) => {
      await tx
        .update(userBooks)
        .set({ description, updatedAt: new Date() })
        .where(eq(userBooks.id, params.id!));
    });

    return { success: true };
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
        error: 'You can’t remove this book because it has an active loan.'
      });
    }

    await removeFromLibrary(locals.user!.id, params.id!);
    //return { removed: true };
    redirect(303, '/library')
  }
};
