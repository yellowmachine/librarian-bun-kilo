import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { requestLoan } from '$lib/server/loans';

// POST /api/loans — solicitar préstamo
// Body: { userBookId: string, notes?: string }
export async function POST({ locals, request }: RequestEvent) {
	if (!locals.user) error(401, 'No autenticado');

	const body = await request.json();
	const userBookId: string = body.userBookId?.trim();
	const notes: string | undefined = body.notes?.trim() || undefined;

	if (!userBookId) error(400, 'userBookId es obligatorio');

	try {
		const loanId = await requestLoan(locals.user.id, userBookId, notes);
		return json({ loanId }, { status: 201 });
	} catch (e) {
		error(400, e instanceof Error ? e.message : 'Error al solicitar el préstamo');
	}
}
