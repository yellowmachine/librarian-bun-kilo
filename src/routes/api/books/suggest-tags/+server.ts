import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import * as v from 'valibot';
import { eq } from 'drizzle-orm';
import { getOpenRouterApiKey } from '$lib/server/openrouterKey';
import { suggestTagsForBook } from '$lib/server/openrouterTags';
import { withRLS } from '$lib/server/db/rls';
import { tags } from '$lib/server/db/schema';

const SuggestTagsSchema = v.object({
	title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
	authors: v.optional(v.array(v.pipe(v.string(), v.trim(), v.maxLength(200))), []),
	description: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(10000)))),
	subjects: v.optional(v.array(v.pipe(v.string(), v.maxLength(300))), [])
});

// POST /api/books/suggest-tags — preselección de tags (de entre los que el
// usuario ya tiene) para un libro encontrado en OpenLibrary. Sin clave de
// OpenRouter en Scholio, o sin tags, simplemente no sugiere nada.
export async function POST({ locals, request }: RequestEvent) {
	if (!locals.user) error(401, 'Not authenticated');

	const raw = await request.json().catch(() => null);
	if (!raw || typeof raw !== 'object') error(400, 'Invalid JSON body.');

	const result = v.safeParse(SuggestTagsSchema, raw);
	if (!result.success) error(400, result.issues[0].message);

	const userTags = await withRLS(locals.user.id, (tx) =>
		tx.select({ id: tags.id, name: tags.name }).from(tags).where(eq(tags.userId, locals.user!.id))
	);
	if (userTags.length === 0) return json({ tagIds: [] });

	const apiKey = await getOpenRouterApiKey(locals.user.id);
	if (!apiKey) return json({ tagIds: [] });

	const names = await suggestTagsForBook(
		apiKey,
		result.output,
		userTags.map((t) => t.name)
	);
	const tagIds = names
		.map((name) => userTags.find((t) => t.name === name)?.id)
		.filter((id): id is string => Boolean(id));
	return json({ tagIds });
}
