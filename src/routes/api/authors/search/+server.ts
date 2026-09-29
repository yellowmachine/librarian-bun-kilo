import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { searchAuthors } from '$lib/server/openlibrary';

// GET /api/authors/search?q=garcia marq
export async function GET({ locals, url }: RequestEvent) {
	if (!locals.user) error(401, 'No autenticado');

	const q = url.searchParams.get('q')?.trim();
	if (!q || q.length < 3) error(400, 'Indica q (mínimo 3 caracteres)');

	try {
		return json(await searchAuthors(q));
	} catch {
		// Las sugerencias son opcionales: si OpenLibrary falla o tarda, el
		// usuario sigue pudiendo escribir el autor a mano.
		return json([]);
	}
}
