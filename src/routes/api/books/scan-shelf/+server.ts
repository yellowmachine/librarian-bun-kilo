import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import * as v from 'valibot';
import { eq } from 'drizzle-orm';
import { getOpenRouterApiKey } from '$lib/server/openrouterKey';
import { identifyBooksFromImage } from '$lib/server/openrouterVision';
import { withRLS } from '$lib/server/db/rls';
import { tags } from '$lib/server/db/schema';

const ScanShelfSchema = v.object({
	image: v.pipe(v.string(), v.regex(/^data:image\/\w+;base64,/), v.minLength(100))
});

// POST /api/books/scan-shelf — identifica libros por el lomo en una foto de
// estantería, usando la clave de OpenRouter que el usuario ya conectó en
// Scholio (no hay ajustes propios de Librarian para esto).
export async function POST({ locals, request }: RequestEvent) {
	if (!locals.user) error(401, 'Not authenticated');

	const raw = await request.json().catch(() => null);
	if (!raw || typeof raw !== 'object') error(400, 'Invalid JSON body.');

	const result = v.safeParse(ScanShelfSchema, raw);
	if (!result.success) error(400, result.issues[0].message);

	const apiKey = await getOpenRouterApiKey(locals.user.id);
	if (!apiKey) {
		error(400, 'No OpenRouter key connected. Connect one in Scholio settings, then try again.');
	}

	const userTags = await withRLS(locals.user.id, (tx) =>
		tx.select({ name: tags.name }).from(tags).where(eq(tags.userId, locals.user!.id))
	);

	const candidates = await identifyBooksFromImage(
		apiKey,
		result.output.image,
		userTags.map((t) => t.name)
	);
	return json({ candidates });
}
