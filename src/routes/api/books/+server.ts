import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getUserBooks, addBookToLibrary, upsertBook, resolveBook } from '$lib/server/books';

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

	const body = await request.json();
	const isbn: string | undefined = body.isbn?.trim();
	const workId: string | undefined = body.workId?.trim();
	const notes: string | undefined = body.notes?.trim() || undefined;

	const identifier = isbn ?? workId;
	if (!identifier) error(400, 'Se requiere isbn o workId');

	// Resolver desde OpenLibrary (o caché en BD)
	const bookData = await resolveBook(identifier);
	if (!bookData) error(404, 'Libro no encontrado en OpenLibrary');

	// Guardar en catálogo global si no existe
	const bookId = await upsertBook(bookData);

	// Añadir a biblioteca del usuario
	const userBookId = await addBookToLibrary(locals.user.id, bookId, notes);

	return json({ userBookId, bookId, title: bookData.title }, { status: 201 });
}
