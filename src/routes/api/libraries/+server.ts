import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getUserLibraries } from '$lib/server/libraries';

// GET /api/libraries — lista las bibliotecas del usuario
export async function GET({ locals }: RequestEvent) {
	if (!locals.user) error(401, 'Not authenticated.');

	const result = await getUserLibraries(locals.user.id);
	return json(result);
}
