import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import * as v from 'valibot';
import { getOpenRouterApiKey } from '$lib/server/openrouterKey';
import { scanBookCover } from '$lib/server/bookCoverVision';

const ScanCoverSchema = v.object({
	image: v.pipe(v.string(), v.regex(/^data:image\/\w+;base64,/), v.minLength(100))
});

// POST /api/books/scan-cover — identifica un libro por la foto de su portada y
// propone obras de OpenLibrary, la más probable primero. Usa la clave de
// OpenRouter que el usuario conectó en /account.
// Respuesta: { reading: CoverReading | null, candidates: CoverCandidate[] }
export async function POST({ locals, request }: RequestEvent) {
	if (!locals.user) error(401, 'Not authenticated');

	const raw = await request.json().catch(() => null);
	if (!raw || typeof raw !== 'object') error(400, 'Invalid JSON body.');

	const result = v.safeParse(ScanCoverSchema, raw);
	if (!result.success) error(400, result.issues[0].message);

	const apiKey = await getOpenRouterApiKey(locals.user.id);
	if (!apiKey) {
		error(400, 'No OpenRouter key connected. Connect one in your account, then try again.');
	}

	const scan = await scanBookCover(apiKey, result.output.image, {
		userId: locals.user.id,
		kind: 'book_cover_scan'
	});
	return json(scan);
}
