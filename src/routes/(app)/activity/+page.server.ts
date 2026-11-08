import type { RequestEvent } from '@sveltejs/kit';
import { getGroupRecentBooks } from '$lib/server/groups';
import { getRecentVisibleMovies } from '$lib/server/movies';

const LIMIT = 50;

type ActivityItem = {
	kind: 'book' | 'movie';
	id: string;
	href: string;
	title: string;
	creators: string[];
	coverUrl: string | null;
	year: number | null;
	isAvailable: boolean;
	addedAt: Date;
};

// Libros y películas juntos, del más reciente al más antiguo.
export const load = async ({ locals }: RequestEvent) => {
	const userId = locals.user!.id;
	const [books, movies] = await Promise.all([
		getGroupRecentBooks(userId, LIMIT),
		getRecentVisibleMovies(userId, LIMIT)
	]);

	const items: ActivityItem[] = [
		...books.map((b) => ({
			kind: 'book' as const,
			id: b.userBookId,
			href: `/library/${b.userBookId}`,
			title: b.title,
			creators: b.authors,
			coverUrl: b.coverUrl,
			year: b.publishYear,
			isAvailable: b.isAvailable,
			addedAt: b.addedAt
		})),
		...movies.map((m) => ({
			kind: 'movie' as const,
			id: m.userMovieId,
			href: `/movies/${m.userMovieId}`,
			title: m.title,
			creators: m.directors,
			coverUrl: m.coverUrl,
			year: m.releaseYear,
			isAvailable: m.isAvailable,
			addedAt: m.addedAt
		}))
	]
		.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
		.slice(0, LIMIT);

	return { items };
};
