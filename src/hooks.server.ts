import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { error, type Handle } from '@sveltejs/kit';

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

  // Cualquier usuario autenticado tiene acceso a Librarian.
  // Ambas apps comparten public.user — el gate es la sesión, no un perfil adicional.
  // El modelo de user_profile se revisará cuando haya requisitos concretos de acceso.
  if (userId) {
    event.locals.hasLibrarianProfile = true;
  }

  return svelteKitHandler({ event, resolve, auth, building });
};
