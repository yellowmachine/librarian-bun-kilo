import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { requestLoan, type LoanItem } from '$lib/server/loans';

// POST /api/loans — solicitar préstamo de un libro o de una película
// Body: { userBookId: string, notes?: string } o { userMovieId: string, notes?: string }
export async function POST({ locals, request }: RequestEvent) {
	if (!locals.user) error(401, 'No autenticado');

	const body = await request.json().catch(() => null);
	const userBookId = typeof body?.userBookId === 'string' ? body.userBookId.trim() : '';
	const userMovieId = typeof body?.userMovieId === 'string' ? body.userMovieId.trim() : '';
	const notes: string | undefined =
		typeof body?.notes === 'string' ? body.notes.trim() || undefined : undefined;

	if (Boolean(userBookId) === Boolean(userMovieId)) {
		error(400, 'Exactly one of userBookId or userMovieId is required.');
	}
	const item: LoanItem = userBookId ? { kind: 'book', userBookId } : { kind: 'movie', userMovieId };

	try {
		const loanId = await requestLoan(locals.user.id, item, notes);
		return json({ loanId }, { status: 201 });
	} catch (e) {
		error(400, e instanceof Error ? e.message : 'Error requesting the loan.');
	}
}
