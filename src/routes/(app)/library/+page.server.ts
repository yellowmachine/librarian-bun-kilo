import type { RequestEvent } from '@sveltejs/kit';
import { getUserBooks, getContactBooks } from '$lib/server/books';
import { searchBooksFromOthers, getContacts } from '$lib/server/groups';

export const load = async ({ locals }: RequestEvent) => {
  const [userBooks, contacts] = await Promise.all([
    getUserBooks(locals.user!.id, { type: 'all' }),
    getContacts(locals.user!.id)
  ]);
  return { userBooks, contacts };
};

export const actions = {
  searchOthers: async ({ locals, request }: RequestEvent) => {
    const data = await request.formData();
    const query = (data.get('query') as string)?.trim() ?? '';
    const results = await searchBooksFromOthers(locals.user!.id, query);
    return { othersResults: results, othersQuery: query };
  },

  contactBooks: async ({ locals, request }: RequestEvent) => {
    const data = await request.formData();
    const contactId = (data.get('contactId') as string)?.trim() ?? '';
    if (!contactId) return { contactBooks: [], contactId: '' };
    const results = await getContactBooks(locals.user!.id, contactId);
    return { contactBooks: results, contactId };
  }
};
