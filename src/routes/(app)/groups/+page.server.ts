import { fail, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getUserGroups, joinGroupByCode } from '$lib/server/groups';

export const load = async ({ locals }: RequestEvent) => {
	const userGroups = await getUserGroups(locals.user!.id);
	return { userGroups };
};

export const actions = {
	// Unirse a un grupo por código de invitación
	join: async ({ locals, request }: RequestEvent) => {
		const data = await request.formData();
		const code = (data.get('code') as string)?.trim().toUpperCase();

		if (!code) return fail(400, { joinError: 'Introduce un código' });

		const result = await joinGroupByCode(locals.user!.id, code);
		if (!result.success) return fail(400, { joinError: result.error });

		redirect(302, `/groups/${result.groupId}`);
	}
};
