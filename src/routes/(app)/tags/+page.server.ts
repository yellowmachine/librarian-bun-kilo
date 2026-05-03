import { fail } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import type { RequestEvent } from '@sveltejs/kit';
import { eq, and, sql } from 'drizzle-orm';
import { withRLS } from '$lib/server/db/rls';
import { tags, userBookTags, sharedTags } from '$lib/server/db/schema';

export const load = async ({ locals }: RequestEvent) => {
	const result = await withRLS(locals.user!.id, async (tx) => {
		const rows = await tx
			.select({
				id: tags.id,
				name: tags.name,
				color: tags.color,
				bookCount: sql<number>`count(distinct ${userBookTags.userBookId})::int`,
				groupCount: sql<number>`count(distinct ${sharedTags.groupId})::int`
			})
			.from(tags)
			.leftJoin(userBookTags, eq(tags.id, userBookTags.tagId))
			.leftJoin(sharedTags, eq(tags.id, sharedTags.tagId))
			.where(eq(tags.userId, locals.user!.id))
			.groupBy(tags.id)
			.orderBy(tags.name);
		return rows;
	});

	return { tags: result };
};

export const actions = {
	create: async ({ locals, request }: RequestEvent) => {
		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();
		const color = (data.get('color') as string)?.trim() || null;

		if (!name) return fail(400, { createError: 'Name cannot be empty' });

		const id = nanoid();
		await withRLS(locals.user!.id, (tx) =>
			tx.insert(tags).values({ id, userId: locals.user!.id, name, color })
		);

		return { created: true };
	},

	update: async ({ locals, request }: RequestEvent) => {
		const data = await request.formData();
		const id = data.get('id') as string;
		const name = (data.get('name') as string)?.trim();
		const color = (data.get('color') as string)?.trim() || null;

		if (!id) return fail(400, { error: 'id required' });
		if (!name) return fail(400, { error: 'Name cannot be empty' });

		await withRLS(locals.user!.id, (tx) =>
			tx
				.update(tags)
				.set({ name, color })
				.where(and(eq(tags.id, id), eq(tags.userId, locals.user!.id)))
		);

		return { success: true };
	},

	delete: async ({ locals, request }: RequestEvent) => {
		const data = await request.formData();
		const id = data.get('id') as string;

		if (!id) return fail(400, { error: 'id required' });

		await withRLS(locals.user!.id, (tx) =>
			tx.delete(tags).where(and(eq(tags.id, id), eq(tags.userId, locals.user!.id)))
		);

		return { deleted: true };
	}
};
