import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { withRLS } from '$lib/server/db/rls';
import { tags } from '$lib/server/db/schema';

// GET /api/tags — lista las etiquetas del usuario
export async function GET({ locals }: RequestEvent) {
	if (!locals.user) error(401, 'No autenticado');

	const result = await withRLS(locals.user.id, (tx) =>
		tx.select().from(tags).where(eq(tags.userId, locals.user!.id))
	);
	return json(result);
}

// POST /api/tags — crea una etiqueta
// Body: { name: string, color?: string }
export async function POST({ locals, request }: RequestEvent) {
	if (!locals.user) error(401, 'No autenticado');

	const body = await request.json();
	const name: string = body.name?.trim();
	const color: string | undefined = body.color?.trim() || undefined;

	if (!name) error(400, 'El nombre es obligatorio');

	const id = nanoid();
	await withRLS(locals.user.id, (tx) =>
		tx.insert(tags).values({ id, userId: locals.user!.id, name, color })
	);

	return json({ id, name, color: color ?? null }, { status: 201 });
}
