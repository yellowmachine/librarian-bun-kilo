import type { RequestEvent } from '@sveltejs/kit';
import { getUserBooks } from '$lib/server/books';

export const load = async ({ locals }: RequestEvent) => {
  const books = await getUserBooks(locals.user!.id, { type: 'recent', limit: 50 });
  return { books };
};
