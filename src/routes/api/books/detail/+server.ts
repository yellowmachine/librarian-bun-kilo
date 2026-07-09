import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { resolveBook, previewAlternateTitle } from '$lib/server/books';

// GET /api/books/detail?workId=OL45804W
// Devuelve la descripción y datos completos de un work sin añadirlo a la biblioteca.
export async function GET({ locals, url }: RequestEvent) {
	if (!locals.user) error(401, 'Not authenticated');

	const workId = url.searchParams.get('workId')?.trim();
	if (!workId) error(400, 'workId required');

	const book = await resolveBook(workId);
	if (!book) error(404, 'Book not found');

	const alternateTitle = await previewAlternateTitle(workId, book.title);

	return json({ description: book.description, alternateTitle });
}
