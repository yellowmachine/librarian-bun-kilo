import { auth } from '$lib/server/auth';
import { withRLS } from '$lib/server/db/rls';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { error, type Handle, type ServerInit } from '@sveltejs/kit';
import { inviteFirstAccount } from '$lib/server/invitations';

export const handle: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	const userId = event.locals.user?.id;

	// Adjuntar withRLS al evento: ejecuta un callback en una transacción con RLS activo
	// para el usuario autenticado. SET LOCAL — solo aplica en esta transacción.
	event.locals.withRLS = (fn) => {
		if (!userId) error(401, 'Unauthorized');
		return withRLS(userId, fn);
	};

	return svelteKitHandler({ event, resolve, auth, building });
};

// Al arrancar sin cuentas, la primera invitación (ADMIN_EMAIL). No en el build.
export const init: ServerInit = async () => {
	if (building) return;
	await inviteFirstAccount().catch((err) =>
		console.error('[invitations] No se pudo crear la primera invitación:', err)
	);
};
