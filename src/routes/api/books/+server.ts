import { json, error, isHttpError } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import * as v from 'valibot';
import { getUserBooks, addBookToLibrary, upsertBook, resolveBook } from '$lib/server/books';

const AddBookSchema = v.pipe(
  v.object({
    isbn: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(13))),
    workId: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(32))),
    notes: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(1000)))
  }),
  v.check(({ isbn, workId }) => Boolean(isbn || workId), 'An ISBN or workId is required.')
);

// GET /api/books — lista los libros del usuario autenticado
export async function GET({ locals }: RequestEvent) {
  if (!locals.user) error(401, 'Not authenticated');

  const userBooksList = await getUserBooks(locals.user.id);
  return json(userBooksList);
}

// POST /api/books — añade un libro a la biblioteca del usuario
// Body: { isbn?: string, workId?: string, notes?: string }
//

export async function POST({ locals, request }: RequestEvent) {
  if (!locals.user) error(401, 'Not authenticated');

  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== 'object') error(400, 'Invalid JSON body.');

  const result = v.safeParse(AddBookSchema, raw);
  if (!result.success) {
    error(400, result.issues[0].message);
  }

  try {
    const { isbn, workId, notes } = result.output;
    const identifier = isbn ?? workId!;

    const bookData = await resolveBook(identifier);
    if (!bookData) error(404, 'Book not found on OpenLibrary');

    const bookId = await upsertBook(bookData);

    const userBookId = await addBookToLibrary(locals.user.id, bookId, notes);

    return json(
      { userBookId, bookId, title: bookData.title },
      { status: 201 }
    );
  } catch (e) {
    if (isHttpError(e)) throw e;

    console.error('POST /api/books/detail failed', e);
    error(500, 'Unexpected error');
  }
}

