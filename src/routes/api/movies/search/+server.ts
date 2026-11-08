import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { searchMovies } from '$lib/server/tmdb';

// GET /api/movies/search?q=blade+runner&year=1982
// Sin TMDB_API_KEY devuelve [] (la página de alta ya lo sabe y ofrece solo
// el alta manual).
export async function GET({ locals, url }: RequestEvent) {
	if (!locals.user) error(401, 'Not authenticated');

	const q = url.searchParams.get('q')?.trim() ?? '';
	if (q.length < 2) error(400, 'q must be at least 2 characters');

	const yearParam = Number(url.searchParams.get('year'));
	const year =
		Number.isInteger(yearParam) && yearParam > 1800 && yearParam < 3000 ? yearParam : undefined;

	return json(await searchMovies(q.slice(0, 200), year));
}
