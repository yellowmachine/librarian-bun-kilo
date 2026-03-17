import { fail, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { createGroup } from '$lib/server/groups';

export const actions = {
	default: async ({ locals, request }: RequestEvent) => {
		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();
		const description = (data.get('description') as string)?.trim() || undefined;

		if (!name) return fail(400, { error: 'El nombre es obligatorio' });
		if (name.length > 60) return fail(400, { error: 'Máximo 60 caracteres' });

		const groupId = await createGroup(locals.user!.id, { name, description });
		redirect(302, `/groups/${groupId}`);
	}
};
