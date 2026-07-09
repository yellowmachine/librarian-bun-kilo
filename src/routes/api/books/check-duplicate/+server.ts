import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { findDuplicateUserBook } from '$lib/server/books';

// GET /api/books/check-duplicate?workId=&isbn=&title=&authors=Foo&authors=Bar
// Comprueba si el usuario ya tiene un libro que coincide (por workId exacto,
// ISBN o título+autor) en cualquiera de sus bibliotecas, antes de añadirlo.
export async function GET({ locals, url }: RequestEvent) {
	if (!locals.user) error(401, 'Not authenticated');

	const workId = url.searchParams.get('workId')?.trim() || undefined;
	const isbn = url.searchParams.get('isbn')?.trim() || undefined;
	const title = url.searchParams.get('title')?.trim() || undefined;
	const authors = url.searchParams.getAll('authors').filter(Boolean);

	const match = await findDuplicateUserBook(locals.user.id, {
		workId,
		isbn,
		title,
		authors: authors.length > 0 ? authors : undefined
	});

	return json({ match });
}
