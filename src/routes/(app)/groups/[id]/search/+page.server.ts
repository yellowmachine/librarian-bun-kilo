import { error, fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getGroup, getSharedTagsInGroup, searchBooksInGroup } from '$lib/server/groups';
import { requestLoan } from '$lib/server/loans';
import { getReviewStatsForBooks, getBookReviews } from '$lib/server/reviews';

export const load = async ({ locals, params, url }: RequestEvent) => {
	const group = await getGroup(locals.user!.id, params.id!);
	if (!group) error(404, 'Grupo no encontrado');

	const query = url.searchParams.get('q')?.trim() ?? '';
	const tagId = url.searchParams.get('tag') ?? undefined;

	const [sharedTagsList, results] = await Promise.all([
		getSharedTagsInGroup(locals.user!.id, params.id!),
		searchBooksInGroup(locals.user!.id, params.id!, { query: query || undefined, tagId })
	]);

	// Obtener stats y reseñas completas para todos los libros encontrados
	const bookIds = [...new Set(results.map((r) => r.bookId))];
	const reviewStatsMap = await getReviewStatsForBooks(locals.user!.id, bookIds);
	const reviewStats = Object.fromEntries(reviewStatsMap);

	// Reseñas completas agrupadas por bookId (solo las de libros con reseñas)
	const reviewsByBook: Record<string, Awaited<ReturnType<typeof getBookReviews>>> = {};
	for (const bookId of bookIds) {
		const stats = reviewStatsMap.get(bookId);
		if (stats && stats.totalReviews > 0) {
			reviewsByBook[bookId] = await getBookReviews(locals.user!.id, bookId);
		}
	}

	return {
		group,
		sharedTagsList,
		results,
		reviewStats,
		reviewsByBook,
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
