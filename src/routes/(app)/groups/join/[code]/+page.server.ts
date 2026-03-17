import { redirect, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { joinGroupByCode } from '$lib/server/groups';

// El usuario escanea el QR → abre esta URL → se une al grupo automáticamente
export const load = async ({ locals, params }: RequestEvent) => {
	const code = params.code!.toUpperCase();
	const result = await joinGroupByCode(locals.user!.id, code);

	if (!result.success) {
		if (result.error === 'Ya eres miembro de este grupo' && result.groupId) {
			// Ya es miembro — llevarle al grupo igualmente
			redirect(302, `/groups/${result.groupId}`);
		}
		error(400, result.error ?? 'Código de invitación inválido');
	}

	redirect(302, `/groups/${result.groupId}`);
};
