import { json, error, isHttpError } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import * as v from 'valibot';
import { nanoid } from 'nanoid';
import { getUserBooks, addBookToLibrary, upsertBook, resolveBook } from '$lib/server/books';
import { withRLS } from '$lib/server/db/rls';
import { tags, userBookTags } from '$lib/server/db/schema';

const AddBookSchema = v.pipe(
  v.object({
    isbn: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(13))),
    workId: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(32))),
    notes: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(1000))),
    tagsToAdd: v.optional(v.array(v.pipe(v.string(), v.trim()))),
    tagsToCreate: v.optional(
      v.array(
        v.object({
          name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(50)),
          color: v.optional(v.pipe(v.string(), v.trim()))
        })
      )
    )
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
    const { isbn, workId, notes, tagsToAdd, tagsToCreate } = result.output;
    const identifier = workId ?? isbn!;

    const bookData = await resolveBook(identifier);
    if (!bookData) error(404, 'Book not found on OpenLibrary');

    const bookId = await upsertBook(bookData);

    const userBookId = await addBookToLibrary(locals.user.id, bookId, notes);

    const hasTagsToAdd = tagsToAdd && tagsToAdd.length > 0;
    const hasTagsToCreate = tagsToCreate && tagsToCreate.length > 0;

    if (hasTagsToAdd || hasTagsToCreate) {
      await withRLS(locals.user.id, async (tx) => {
        const assignments: { userBookId: string; tagId: string }[] = [];

        if (hasTagsToCreate) {
          for (const newTag of tagsToCreate!) {
            const tagId = nanoid();
            await tx.insert(tags).values({
              id: tagId,
              userId: locals.user!.id,
              name: newTag.name,
              color: newTag.color ?? null
            });
            assignments.push({ userBookId, tagId });
          }
        }

        if (hasTagsToAdd) {
          for (const tagId of tagsToAdd!) {
            assignments.push({ userBookId, tagId });
          }
        }

        if (assignments.length > 0) {
          await tx.insert(userBookTags).values(assignments).onConflictDoNothing();
        }
      });
    }

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

