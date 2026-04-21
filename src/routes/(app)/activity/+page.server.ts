import type { RequestEvent } from '@sveltejs/kit';
import { getGroupRecentBooks } from '$lib/server/groups';

export const load = async ({ locals }: RequestEvent) => {
  const books = await getGroupRecentBooks(locals.user!.id);
  return { books };
};
