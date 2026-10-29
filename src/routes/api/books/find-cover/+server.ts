import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import * as v from 'valibot';
import { getOpenRouterApiKey } from '$lib/server/openrouterKey';
import { findCoverCandidates } from '$lib/server/coverSearch';

const FindCoverSchema = v.object({
	title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
	authors: v.optional(v.array(v.pipe(v.string(), v.trim(), v.maxLength(200))), []),
	isbn: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(20))),
	publishYear: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(9999)))
});

// POST /api/books/find-cover — sugiere portadas para un libro dado de alta a
// mano. Sin clave de OpenRouter solo se usan las fuentes gratuitas;
// con clave, además se pide a la IA (con búsqueda web) pistas que se verifican
// en el servidor — ver src/lib/server/coverSearch.ts.
export async function POST({ locals, request }: RequestEvent) {
	if (!locals.user) error(401, 'Not authenticated');

	const raw = await request.json().catch(() => null);
	if (!raw || typeof raw !== 'object') error(400, 'Invalid JSON body.');

	const result = v.safeParse(FindCoverSchema, raw);
	if (!result.success) error(400, result.issues[0].message);

	const { title, authors, isbn, publishYear } = result.output;
	const apiKey = await getOpenRouterApiKey(locals.user.id);

	const found = await findCoverCandidates(
		{ title, authors: authors.filter(Boolean), isbn: isbn || undefined, publishYear },
		apiKey
	);
	return json(found);
}
