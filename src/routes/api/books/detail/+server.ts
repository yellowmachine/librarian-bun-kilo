import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { resolveBook } from '$lib/server/books';

// GET /api/books/detail?workId=OL45804W
// Devuelve la descripción y datos completos de un work sin añadirlo a la biblioteca.
export async function GET({ locals, url }: RequestEvent) {
	if (!locals.user) error(401, 'No autenticado');

	const workId = url.searchParams.get('workId')?.trim();
	if (!workId) error(400, 'Se requiere workId');

	const book = await resolveBook(workId);
	if (!book) error(404, 'Libro no encontrado');

	return json({ description: book.description });
}
