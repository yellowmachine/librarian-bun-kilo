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
			} else {
				// Sin perfil de Librarian: comprobar si el usuario fue aceptado en Scholio.
				// Si tiene scholio.user_profile, se autoprovision el acceso a Librarian.
				const result = await db.execute(
					sql`SELECT 1 FROM scholio.user_profile WHERE user_id = ${userId} LIMIT 1`
				);

				if (result.length > 0) {
					await db.insert(userProfile).values({ userId }).onConflictDoNothing();
					librarianProfileCache.add(userId);
					event.locals.hasLibrarianProfile = true;
				}
			}
		}
	}

	return svelteKitHandler({ event, resolve, auth, building });
};
