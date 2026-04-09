import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';

// El registro de nuevos usuarios se hace a través de Scholio.
// Una vez aceptados allí, el acceso a Librarian se autoprovision automáticamente.
export const load = ({ locals }: RequestEvent) => {
  if (locals.user && locals.hasLibrarianProfile) redirect(302, '/library');
  redirect(302, env.SCHOLIO_REDIRECT ?? 'https://scholio.review/waitlist');
};
