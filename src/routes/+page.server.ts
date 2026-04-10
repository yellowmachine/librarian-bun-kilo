import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const load = async ({ locals }: RequestEvent) => {
  if (locals.user) redirect(302, '/library');
  redirect(302, env.SCHOLIO_REDIRECT ?? 'https://scholio.review');
};
