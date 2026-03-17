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
	regenerateInviteCode
} from '$lib/server/groups';

export const load = async ({ locals, params }: RequestEvent) => {
	const group = await getGroup(locals.user!.id, params.id!);
	if (!group) error(404, 'Grupo no encontrado');

	const [members, sharedTagsList, myTags] = await Promise.all([
		getGroupMembers(locals.user!.id, params.id!),
		getSharedTagsInGroup(locals.user!.id, params.id!),
		getUserTagsForGroup(locals.user!.id, params.id!)
	]);

	return { group, members, sharedTagsList, myTags };
};

export const actions = {
	// Compartir una etiqueta propia con este grupo
	shareTag: async ({ locals, params, request }: RequestEvent) => {
		const data = await request.formData();
		const tagId = data.get('tagId') as string;
		if (!tagId) return fail(400, { error: 'tagId requerido' });

		await shareTagWithGroup(locals.user!.id, tagId, params.id!);
		return { success: true };
	},

	// Dejar de compartir una etiqueta
	unshareTag: async ({ locals, params, request }: RequestEvent) => {
		const data = await request.formData();
		const tagId = data.get('tagId') as string;
		if (!tagId) return fail(400, { error: 'tagId requerido' });

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
		if (!targetUserId) return fail(400, { error: 'userId requerido' });

		await removeMember(locals.user!.id, params.id!, targetUserId);
		return { success: true };
	},

	// Regenerar código de invitación (solo owner/admin)
	regenerateCode: async ({ locals, params }: RequestEvent) => {
		await regenerateInviteCode(locals.user!.id, params.id!);
		return { success: true };
	}
};
