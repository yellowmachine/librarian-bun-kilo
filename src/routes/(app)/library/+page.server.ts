import type { RequestEvent } from '@sveltejs/kit';
import { getUserBooks } from '$lib/server/books';
import { searchBooksFromOthers } from '$lib/server/groups';

export const load = async ({ locals }: RequestEvent) => {
  const userBooks = await getUserBooks(locals.user!.id, { type: 'all' });
  return { userBooks };
};

export const actions = {
  searchOthers: async ({ locals, request }: RequestEvent) => {
    const data = await request.formData();
    const query = (data.get('query') as string)?.trim() ?? '';
    const results = await searchBooksFromOthers(locals.user!.id, query);
    return { othersResults: results, othersQuery: query };
  }
};
