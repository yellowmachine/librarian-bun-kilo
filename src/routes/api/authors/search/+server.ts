import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { searchAuthors } from '$lib/server/openlibrary';
import { searchUserAuthors } from '$lib/server/books';
import { mergeAuthorResults } from '$lib/server/authorSearch';

// GET /api/authors/search?q=garcia marq
// Busca en paralelo entre los autores de la biblioteca del usuario y en
// OpenLibrary; los locales van primero.
export async function GET({ locals, url }: RequestEvent) {
	if (!locals.user) error(401, 'No autenticado');

	const q = url.searchParams.get('q')?.trim();
	if (!q || q.length < 3) error(400, 'Indica q (mínimo 3 caracteres)');

	// Las sugerencias son opcionales: si una de las dos fuentes falla o tarda,
	// se muestra la otra y el usuario sigue pudiendo escribir el autor a mano.
	const [local, remote] = await Promise.allSettled([
		searchUserAuthors(locals.user.id, q),
		searchAuthors(q)
	]);

	return json(
		mergeAuthorResults(
			local.status === 'fulfilled' ? local.value : [],
			remote.status === 'fulfilled' ? remote.value : []
		)
	);
}
