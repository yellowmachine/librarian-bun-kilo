import { error, fail, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getLoan, transitionLoan, type LoanStatus } from '$lib/server/loans';

export const load = async ({ locals, params }: RequestEvent) => {
	const loan = await getLoan(locals.user!.id, params.id!);
	if (!loan) error(404, 'Préstamo no encontrado');
	return { loan, currentUserId: locals.user!.id };
};

export const actions = {
	transition: async ({ locals, params, request }: RequestEvent) => {
		const data = await request.formData();
		const toStatus = data.get('toStatus') as LoanStatus;

		if (!toStatus) return fail(400, { error: 'toStatus requerido' });

		const result = await transitionLoan(locals.user!.id, params.id!, toStatus);

		if (!result.success) return fail(400, { error: result.error });

		// Si el préstamo termina, volver al listado
		if (['returned', 'rejected', 'cancelled'].includes(toStatus)) {
			redirect(302, '/loans');
		}

		return { success: true };
	}
};
