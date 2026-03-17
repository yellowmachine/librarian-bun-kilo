import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { searchBooks, searchByIsbn } from '$lib/server/openlibrary';

// GET /api/books/search?q=titulo&isbn=9788412
export async function GET({ locals, url }: RequestEvent) {
	if (!locals.user) error(401, 'No autenticado');

	const isbn = url.searchParams.get('isbn')?.trim();
	const q = url.searchParams.get('q')?.trim();

	if (isbn) {
		const book = await searchByIsbn(isbn);
		return json(book ? [book] : []);
	}

	if (q && q.length >= 2) {
		const results = await searchBooks(q, 10);
		return json(results);
	}

	error(400, 'Indica isbn o q (mínimo 2 caracteres)');
}
