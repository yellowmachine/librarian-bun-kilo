import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getSharedTagItems } from '$lib/server/groups';

// GET /api/groups/[id]/tags/[tagId] — los libros y películas que lleva una etiqueta
// compartida en el grupo, para desplegarlos en su página. Vacío si la etiqueta no
// está compartida ahí o el usuario no es miembro.
export async function GET({ locals, params }: RequestEvent) {
	if (!locals.user) error(401, 'Not authenticated');
	return json(await getSharedTagItems(locals.user.id, params.id!, params.tagId!));
}
