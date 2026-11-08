import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import * as v from 'valibot';
import { getOpenRouterApiKey } from '$lib/server/openrouterKey';
import { scanMovies } from '$lib/server/movieVision';

const ScanSchema = v.object({
	image: v.pipe(v.string(), v.regex(/^data:image\/\w+;base64,/), v.minLength(100))
});

// POST /api/movies/scan — identifica películas en una foto de carátulas o
// lomos (con la clave de OpenRouter del usuario) y propone su ficha de TMDB.
// No añade nada: el usuario revisa y confirma en /movies/add.
export async function POST({ locals, request }: RequestEvent) {
	if (!locals.user) error(401, 'Not authenticated');

	const raw = await request.json().catch(() => null);
	if (!raw || typeof raw !== 'object') error(400, 'Invalid JSON body.');

	const result = v.safeParse(ScanSchema, raw);
	if (!result.success) error(400, result.issues[0].message);

	const apiKey = await getOpenRouterApiKey(locals.user.id);
	if (!apiKey) {
		error(400, 'No OpenRouter key connected. Connect one in your account, then try again.');
	}

	return json({
		movies: await scanMovies(apiKey, result.output.image, {
			userId: locals.user.id,
			kind: 'movie_scan'
		})
	});
}
