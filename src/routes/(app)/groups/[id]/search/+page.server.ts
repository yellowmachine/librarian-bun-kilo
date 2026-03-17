import { error, fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getGroup, getSharedTagsInGroup, searchBooksInGroup } from '$lib/server/groups';
import { requestLoan } from '$lib/server/loans';

export const load = async ({ locals, params, url }: RequestEvent) => {
	const group = await getGroup(locals.user!.id, params.id!);
	if (!group) error(404, 'Grupo no encontrado');

	const query = url.searchParams.get('q')?.trim() ?? '';
	const tagId = url.searchParams.get('tag') ?? undefined;

	const [sharedTagsList, results] = await Promise.all([
		getSharedTagsInGroup(locals.user!.id, params.id!),
		searchBooksInGroup(locals.user!.id, params.id!, { query: query || undefined, tagId })
	]);

	return {
		group,
		sharedTagsList,
		results,
		query,
		tagId: tagId ?? null,
		currentUserId: locals.user!.id
	};
};

export const actions = {
	requestLoan: async ({ locals, request }: RequestEvent) => {
		const data = await request.formData();
		const userBookId = data.get('userBookId') as string;
		const notes = (data.get('notes') as string | null)?.trim() || undefined;

		if (!userBookId) return fail(400, { loanError: 'userBookId requerido' });

		try {
			const loanId = await requestLoan(locals.user!.id, userBookId, notes);
			return { loanId };
		} catch (e) {
			return fail(400, { loanError: e instanceof Error ? e.message : 'Error al solicitar' });
		}
	}
};
