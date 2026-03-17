import type { RequestEvent } from '@sveltejs/kit';
import { getUserBooks } from '$lib/server/books';

export const load = async ({ locals }: RequestEvent) => {
	const userBooks = await getUserBooks(locals.user!.id);
	return { userBooks };
};
