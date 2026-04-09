import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import * as v from 'valibot';
import { getUserBooks, addBookToLibrary, upsertBook, resolveBook } from '$lib/server/books';

const AddBookSchema = v.pipe(
	v.object({
		isbn: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(13))),
		workId: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(32))),
		notes: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(1000)))
	}),
	v.check(({ isbn, workId }) => Boolean(isbn || workId), 'Se requiere isbn o workId')
);

// GET /api/books — lista los libros del usuario autenticado
export async function GET({ locals }: RequestEvent) {
	if (!locals.user) error(401, 'No autenticado');

	const userBooksList = await getUserBooks(locals.user.id);
	return json(userBooksList);
}

// POST /api/books — añade un libro a la biblioteca del usuario
// Body: { isbn?: string, workId?: string, notes?: string }
export async function POST({ locals, request }: RequestEvent) {
	if (!locals.user) error(401, 'No autenticado');

	const raw = await request.json().catch(() => null);
	if (!raw || typeof raw !== 'object') error(400, 'Body JSON inválido');

	const result = v.safeParse(AddBookSchema, raw);
	if (!result.success) {
		error(400, result.issues[0].message);
	}

	const { isbn, workId, notes } = result.output;
	const identifier = isbn ?? workId!;

	// Resolver desde OpenLibrary (o caché en BD)
	const bookData = await resolveBook(identifier);
	if (!bookData) error(404, 'Libro no encontrado en OpenLibrary');

	// Guardar en catálogo global si no existe
	const bookId = await upsertBook(bookData);

	// Añadir a biblioteca del usuario
	const userBookId = await addBookToLibrary(locals.user.id, bookId, notes);

	return json({ userBookId, bookId, title: bookData.title }, { status: 201 });
}
