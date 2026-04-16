import { error, fail, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getBookForBorrow, requestLoan } from '$lib/server/loans';

export const load = async ({ locals, params }: RequestEvent) => {
  const book = await getBookForBorrow(locals.user!.id, params.userBookId!);
  if (!book) error(404, 'Book not found');
  return { book };
};

export const actions = {
  request: async ({ locals, params, request }: RequestEvent) => {
    const data = await request.formData();
    const notes = (data.get('notes') as string | null)?.trim() || undefined;

    try {
      const loanId = await requestLoan(locals.user!.id, params.userBookId!, notes);
      redirect(302, `/loans/${loanId}`);
    } catch (e) {
      return fail(400, { error: e instanceof Error ? e.message : 'Error sending request.' });
    }
  }
};
