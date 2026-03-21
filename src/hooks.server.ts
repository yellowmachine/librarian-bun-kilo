import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import type { Handle } from '@sveltejs/kit';

// Cache en memoria: evita consultar la DB en cada request para usuarios que
// ya sabemos que tienen perfil. Se limpia al reiniciar el servidor (comportamiento correcto).
const librarianProfileCache = new Set<string>();

export const handle: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;

		const userId = session.user.id;

		if (librarianProfileCache.has(userId)) {
			event.locals.hasLibrarianProfile = true;
		} else {
			const [profile] = await db
				.select({ userId: userProfile.userId })
				.from(userProfile)
				.where(eq(userProfile.userId, userId))
				.limit(1);

			if (profile) {
				librarianProfileCache.add(userId);
				event.locals.hasLibrarianProfile = true;
			}
		}
	}

	return svelteKitHandler({ event, resolve, auth, building });
};
