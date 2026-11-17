import { fail, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { deleteAccount, getDeletionPreview, isRecentSession } from '$lib/server/accountDeletion';
import { invitations, invitationLink, inviteAndSend } from '$lib/server/invitations';
import {
	hasOpenRouterApiKey,
	removeOpenRouterApiKey,
	setOpenRouterApiKey
} from '$lib/server/openrouterKey';
import { getMonthCostUsd } from '$lib/server/aiUsage';
import type { Actions, PageServerLoad } from './$types';
import { CONTRAST_COOKIE, parseContrast } from '$lib/contrast';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const userId = locals.user!.id;
	const [sent, hasKey, monthCostUsd, deletion] = await Promise.all([
		invitations.sentBy(userId),
		hasOpenRouterApiKey(userId),
		getMonthCostUsd(userId),
		getDeletionPreview(userId)
	]);
	return {
		deletion,
		email: locals.user!.email,
		contrast: parseContrast(cookies.get(CONTRAST_COOKIE)),
		hasKey,
		monthCostUsd,
		invitations: sent.map(({ token, ...i }) => ({
			...i,
			// El enlace solo mientras vale, para pasarlo a mano si el correo no llega.
			link: i.status === 'pending' ? invitationLink(token) : null
		}))
	};
};

export const actions: Actions = {
	invite: async ({ locals, request }) => {
		const email = String((await request.formData()).get('email') ?? '').trim();
		const made = await inviteAndSend(email, locals.user!);
		if (!made.ok)
			return fail(400, { invite: { email, message: made.problem, sent: false, link: null } });
		return { invite: { email, message: null, sent: made.sent, link: made.link } };
	},

	cancel: async ({ locals, request }) => {
		const id = String((await request.formData()).get('id') ?? '');
		await invitations.cancel(id, locals.user!.id);
	},

	saveKey: async ({ locals, request }) => {
		const apiKey = String((await request.formData()).get('apiKey') ?? '').trim();
		if (!apiKey.startsWith('sk-or-'))
			return fail(400, { key: { message: 'Eso no parece una clave de OpenRouter (sk-or-…)' } });
		await setOpenRouterApiKey(locals.user!.id, apiKey);
		return { key: { message: null } };
	},

	removeKey: async ({ locals }) => {
		await removeOpenRouterApiKey(locals.user!.id);
	},

	// Por dispositivo: un año, y para toda la app (también las páginas sin sesión)
	setContrast: async ({ cookies, request }) => {
		const contrast = parseContrast(String((await request.formData()).get('contrast') ?? ''));
		cookies.set(CONTRAST_COOKIE, contrast, {
			path: '/',
			maxAge: 60 * 60 * 24 * 365,
			sameSite: 'lax',
			httpOnly: true
		});
		return { contrast };
	},

	// Borrar la cuenta (#94): nunca se bloquea por préstamos (ver accountDeletion.ts).
	// Sin contraseña (quien entra con Seilide no tiene): el email escrito y una
	// sesión de hace menos de 15 minutos.
	deleteAccount: async ({ locals, request }) => {
		const confirm = String((await request.formData()).get('confirmEmail') ?? '').trim();
		const { user, session } = locals;
		if (confirm.toLowerCase() !== user!.email.toLowerCase())
			return fail(400, {
				deletion: { message: 'El email no coincide con el de tu cuenta', reauth: false }
			});
		if (!isRecentSession(session!.createdAt))
			return fail(400, {
				deletion: {
					message:
						'Por seguridad, vuelve a entrar antes de borrar la cuenta: tu sesión empezó hace más de 15 minutos.',
					reauth: true
				}
			});

		await deleteAccount(user!.id);
		// La sesión ya se fue con la cuenta: esto borra la cookie
		await auth.api
			.signOut({ headers: request.headers })
			.catch((err) => console.error('[account] signOut after delete failed:', err));
		redirect(303, '/login?account-deleted');
	}
};
