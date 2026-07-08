import { json, error, isHttpError } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import * as v from 'valibot';
import { moveBooksToLibrary } from '$lib/server/libraries';

const BulkMoveSchema = v.object({
	userBookIds: v.pipe(v.array(v.pipe(v.string(), v.trim())), v.minLength(1)),
	libraryId: v.pipe(v.string(), v.trim(), v.minLength(1))
});

// PATCH /api/books/library — mueve varios libros del usuario a otra de sus bibliotecas
// Body: { userBookIds: string[], libraryId: string }
export async function PATCH({ locals, request }: RequestEvent) {
	if (!locals.user) error(401, 'Not authenticated');

	const raw = await request.json().catch(() => null);
	if (!raw || typeof raw !== 'object') error(400, 'Invalid JSON body.');

	const result = v.safeParse(BulkMoveSchema, raw);
	if (!result.success) error(400, result.issues[0].message);

	try {
		await moveBooksToLibrary(locals.user.id, result.output.userBookIds, result.output.libraryId);
		return json({ success: true });
	} catch (e) {
		if (isHttpError(e)) throw e;

		if (e instanceof Error && e.message === 'Library not found.') {
			error(404, e.message);
		}

		console.error('PATCH /api/books/library failed', e);
		error(500, 'Unexpected error');
	}
}
