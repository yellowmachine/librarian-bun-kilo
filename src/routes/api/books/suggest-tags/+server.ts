import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import * as v from 'valibot';
import { eq } from 'drizzle-orm';
import { getOpenRouterApiKey } from '$lib/server/openrouterKey';
import {
	subjectsFromOpenLibraryData,
	suggestTagsForBook,
	type TagSuggestionInput
} from '$lib/server/openrouterTags';
import { getUserBook } from '$lib/server/books';
import { withRLS } from '$lib/server/db/rls';
import { db } from '$lib/server/db/index';
import { books, tags } from '$lib/server/db/schema';

const BookDataSchema = v.object({
	title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
	authors: v.optional(v.array(v.pipe(v.string(), v.trim(), v.maxLength(200))), []),
	description: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(10000)))),
	subjects: v.optional(v.array(v.pipe(v.string(), v.maxLength(300))), [])
});

// Libro ya dado de alta: el servidor saca título/autores/sinopsis/materias.
const UserBookSchema = v.object({
	userBookId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100))
});

const SuggestTagsSchema = v.union([UserBookSchema, BookDataSchema]);

// POST /api/books/suggest-tags — sugerencia de tags para un libro: los que
// encajan de entre los que el usuario ya tiene (tagIds) y unos pocos nuevos
// que merecería crear (newTags). Acepta los datos de un libro encontrado en
// OpenLibrary (alta) o el userBookId de uno ya dado de alta (re-tagear). Sin
// clave de OpenRouter, simplemente no sugiere nada.
export async function POST({ locals, request }: RequestEvent) {
	if (!locals.user) error(401, 'Not authenticated');
	const userId = locals.user.id;

	const raw = await request.json().catch(() => null);
	if (!raw || typeof raw !== 'object') error(400, 'Invalid JSON body.');

	const result = v.safeParse(SuggestTagsSchema, raw);
	if (!result.success) error(400, result.issues[0].message);

	let book: TagSuggestionInput;
	if ('userBookId' in result.output) {
		const userBook = await getUserBook(userId, result.output.userBookId);
		if (!userBook || userBook.ownerId !== userId) error(404, 'Book not found');
		const catalog = userBook.bookId
			? await db
					.select({ openlibraryData: books.openlibraryData })
					.from(books)
					.where(eq(books.id, userBook.bookId))
			: [];
		book = {
			title: userBook.title,
			authors: userBook.authors,
			description: userBook.description,
			subjects: subjectsFromOpenLibraryData(catalog[0]?.openlibraryData)
		};
	} else {
		book = result.output;
	}

	const apiKey = await getOpenRouterApiKey(userId);
	if (!apiKey) return json({ tagIds: [], newTags: [] });

	const userTags = await withRLS(userId, (tx) =>
		tx.select({ id: tags.id, name: tags.name }).from(tags).where(eq(tags.userId, userId))
	);

	const { existing, proposed } = await suggestTagsForBook(
		apiKey,
		book,
		userTags.map((t) => t.name)
	);
	const tagIds = existing
		.map((name) => userTags.find((t) => t.name === name)?.id)
		.filter((id): id is string => Boolean(id));
	return json({ tagIds, newTags: proposed });
}
