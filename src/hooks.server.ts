import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { error, type Handle } from '@sveltejs/kit';

// Cache en memoria: evita consultar la DB en cada request para usuarios que
// ya sabemos que tienen perfil. Se limpia al reiniciar el servidor (comportamiento correcto).
const librarianProfileCache = new Set<string>();

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
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
      await tx.execute(sql`SET LOCAL ROLE scholio_app`);
      await tx.execute(sql`SET LOCAL search_path = librarian, public`);
      return fn(tx as unknown as typeof db);
    });
  };

  if (userId) {
    if (librarianProfileCache.has(userId)) {
      event.locals.hasLibrarianProfile = true;
    } else {
      try {
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
          await event.locals.withRLS(async (tx) => {
            const result = await tx.execute(
              sql`SELECT 1 FROM scholio.user_profile WHERE user_id = ${userId} LIMIT 1`
            );
            if (result.length > 0) {
              await tx.insert(userProfile).values({ userId }).onConflictDoNothing();
              librarianProfileCache.add(userId);
              event.locals.hasLibrarianProfile = true;
            }
          });
        }
      } catch (e) {
        console.log(e);
      }
    }
  }

  return svelteKitHandler({ event, resolve, auth, building });
};
