import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { searchBooks, searchByIsbn } from '$lib/server/openlibrary';
import { translateBookTitle } from '$lib/server/wikidata';
import type { BookSearchResult } from '$lib/types';

function mergeById(primary: BookSearchResult[], extra: BookSearchResult[]): BookSearchResult[] {
	const seen = new Set(primary.map((r) => r.id));
	const merged = [...primary];
	for (const r of extra) {
		if (!seen.has(r.id)) {
			merged.push(r);
			seen.add(r.id);
		}
	}
	return merged;
}

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
		// La búsqueda directa y la traducción vía Wikidata se lanzan en
		// paralelo — el nº de resultados de OpenLibrary no es señal fiable de
		// que haga falta traducir (puede devolver ya 1 resultado en inglés,
		// correcto o no), así que se intenta siempre.
		const [directResults, translated] = await Promise.all([
			searchBooks(q, 10),
			translateBookTitle(q, 'es', 'en')
		]);

		let translatedResults: BookSearchResult[] = [];
		let translatedQueryUsed: string | null = null;
		if (translated) {
			for (const candidate of [translated.label, ...translated.aliases]) {
				const res = await searchBooks(candidate, 10);
				if (res.length > 0) {
					translatedResults = res;
					translatedQueryUsed = candidate;
					break;
				}
			}
		}

		const merged = mergeById(directResults, translatedResults);
		const headers = translatedQueryUsed
			? { 'X-Translated-Query': encodeURIComponent(translatedQueryUsed) }
			: undefined;
		return json(merged, headers ? { headers } : undefined);
	}

	error(400, 'Indica isbn o q (mínimo 2 caracteres)');
}
