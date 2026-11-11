import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import * as v from 'valibot';
import { getOpenRouterApiKey } from '$lib/server/openrouterKey';
import { readIsbnFromImage } from '$lib/server/isbnVision';

const ScanIsbnSchema = v.object({
	image: v.pipe(v.string(), v.regex(/^data:image\/\w+;base64,/), v.minLength(100))
});

// POST /api/books/scan-isbn — lee el ISBN de una foto con IA, cuando el lector
// de códigos de barras del navegador no ha podido. Usa la clave de OpenRouter
// que el usuario conectó en /account.
// Respuesta: { isbn: string | null, read: string[] } — isbn solo si pasa el
// dígito de control.
export async function POST({ locals, request }: RequestEvent) {
	if (!locals.user) error(401, 'Not authenticated');

	const raw = await request.json().catch(() => null);
	if (!raw || typeof raw !== 'object') error(400, 'Invalid JSON body.');

	const result = v.safeParse(ScanIsbnSchema, raw);
	if (!result.success) error(400, result.issues[0].message);

	const apiKey = await getOpenRouterApiKey(locals.user.id);
	if (!apiKey) {
		error(400, 'No OpenRouter key connected. Connect one in your account, then try again.');
	}

	const reading = await readIsbnFromImage(apiKey, result.output.image, {
		userId: locals.user.id,
		kind: 'book_isbn_scan'
	});
	if (!reading) error(502, 'Could not analyze the photo. Try again.');
	return json(reading);
}
