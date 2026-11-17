import { error, fail, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import {
	getGroup,
	getGroupMembers,
	getSharedTagsInGroup,
	getUserTagsForGroup,
	shareTagWithGroup,
	unshareTag,
	leaveGroup,
	removeMember,
	regenerateInviteCode,
	deleteGroup,
	getGroupItemCounts
} from '$lib/server/groups';

export const load = async ({ locals, params }: RequestEvent) => {
	const group = await getGroup(locals.user!.id, params.id!);
	if (!group) error(404, 'Group not found');

	const [members, sharedTagsList, myTags, itemCounts] = await Promise.all([
		getGroupMembers(locals.user!.id, params.id!),
		getSharedTagsInGroup(locals.user!.id, params.id!),
		getUserTagsForGroup(locals.user!.id, params.id!),
		// Para avisar al owner de lo que se deja de compartir si borra el grupo
		group.role === 'owner'
			? getGroupItemCounts(locals.user!.id, { includeOwn: true })
			: Promise.resolve({} as Record<string, { books: number; movies: number }>)
	]);

	return {
		group,
		members,
		sharedTagsList,
		myTags,
		sharedTotals: itemCounts[group.id] ?? { books: 0, movies: 0 }
	};
};

export const actions = {
	// Compartir una etiqueta propia con este grupo
	shareTag: async ({ locals, params, request }: RequestEvent) => {
		const data = await request.formData();
		const tagId = data.get('tagId') as string;
		if (!tagId) return fail(400, { error: 'tagId required' });

		await shareTagWithGroup(locals.user!.id, tagId, params.id!);
		return { success: true };
	},

	// Dejar de compartir una etiqueta
	unshareTag: async ({ locals, params, request }: RequestEvent) => {
		const data = await request.formData();
		const tagId = data.get('tagId') as string;
		if (!tagId) return fail(400, { error: 'tagId required' });

		await unshareTag(locals.user!.id, tagId, params.id!);
		return { success: true };
	},

	// Salir del grupo
	leave: async ({ locals, params }: RequestEvent) => {
		await leaveGroup(locals.user!.id, params.id!);
		redirect(302, '/groups');
	},

	// Expulsar a un miembro (solo owner/admin)
	removeMember: async ({ locals, params, request }: RequestEvent) => {
		const data = await request.formData();
		const targetUserId = data.get('userId') as string;
		if (!targetUserId) return fail(400, { error: 'userId required' });

		await removeMember(locals.user!.id, params.id!, targetUserId);
		return { success: true };
	},

	// Borrar el grupo (solo el owner; la RLS lo impone). Con más miembros, hay que escribir su
	// nombre para confirmar.
	deleteGroup: async ({ locals, params, request }: RequestEvent) => {
		const group = await getGroup(locals.user!.id, params.id!);
		if (!group) error(404, 'Group not found');
		if (group.role !== 'owner') return fail(403, { error: 'Only the owner can delete the group.' });

		const confirmName = String((await request.formData()).get('confirmName') ?? '').trim();
		if (group.memberCount > 1 && confirmName !== group.name)
			return fail(400, { error: 'Type the group name to confirm.' });

		if (!(await deleteGroup(locals.user!.id, params.id!)))
			return fail(403, { error: 'The group could not be deleted.' });
		redirect(303, '/groups');
	},

	// Regenerar código de invitación (solo owner/admin)
	regenerateCode: async ({ locals, params }: RequestEvent) => {
		await regenerateInviteCode(locals.user!.id, params.id!);
		return { success: true };
	}
};
