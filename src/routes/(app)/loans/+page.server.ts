import type { RequestEvent } from '@sveltejs/kit';
import { getUserLoans } from '$lib/server/loans';

export const load = async ({ locals }: RequestEvent) => {
	const { asOwner, asBorrower } = await getUserLoans(locals.user!.id);
	return { asOwner, asBorrower };
};
