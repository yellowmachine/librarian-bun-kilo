import { fail, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { createGroup, parseGroupFields } from '$lib/server/groups';

export const actions = {
	default: async ({ locals, request }: RequestEvent) => {
		const fields = parseGroupFields(await request.formData());
		if ('error' in fields) return fail(400, { error: fields.error });

		const groupId = await createGroup(locals.user!.id, {
			name: fields.name,
			description: fields.description ?? undefined
		});
		redirect(302, `/groups/${groupId}`);
	}
};
