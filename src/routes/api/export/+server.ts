import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { eq, inArray, and } from 'drizzle-orm';
import { withRLS } from '$lib/server/db/rls';
import { books, userBooks, userBookTags, tags, bookReviews } from '$lib/server/db/schema';

// GET /api/export — descarga la biblioteca del usuario como YAML
export async function GET({ locals }: RequestEvent) {
	if (!locals.user) error(401, 'Not authenticated');

	const userId = locals.user.id;

	const rows = await withRLS(userId, (tx) =>
		tx
			.select({
				userBookId: userBooks.id,
				bookId: books.id,
				title: books.title,
				authors: books.authors,
				isbn: books.isbn,
				coverUrl: books.coverUrl,
				publishYear: books.publishYear,
				notes: userBooks.notes
			})
			.from(userBooks)
			.innerJoin(books, eq(userBooks.bookId, books.id))
			.orderBy(books.title)
	);

	if (rows.length === 0) {
		return yamlResponse('books: []\n');
	}

	const bookIds = [...new Set(rows.map((r) => r.bookId))];
	const userBookIds = rows.map((r) => r.userBookId);

	const [allTags, ownRatings] = await Promise.all([
		withRLS(userId, (tx) =>
			tx
				.select({ userBookId: userBookTags.userBookId, name: tags.name })
				.from(userBookTags)
				.innerJoin(tags, eq(userBookTags.tagId, tags.id))
				.where(inArray(userBookTags.userBookId, userBookIds))
		),
		// book_reviews RLS allows all authenticated users to read — filter by userId explicitly
		withRLS(userId, (tx) =>
			tx
				.select({ bookId: bookReviews.bookId, rating: bookReviews.rating })
				.from(bookReviews)
				.where(and(inArray(bookReviews.bookId, bookIds), eq(bookReviews.userId, userId)))
		)
	]);

	const tagsByBook = new Map<string, string[]>();
	for (const t of allTags) {
		const list = tagsByBook.get(t.userBookId) ?? [];
		list.push(t.name);
		tagsByBook.set(t.userBookId, list);
	}

	const ratingByBook = new Map(ownRatings.map((r) => [r.bookId, r.rating]));

	const yaml = serializeLibraryYaml(
		rows.map((row) => ({
			title: row.title,
			authors: row.authors ?? [],
			isbn: row.isbn ?? null,
			coverUrl: row.coverUrl ?? null,
			publishYear: row.publishYear ?? null,
			rating: ratingByBook.get(row.bookId) ?? null,
			notes: row.notes ?? null,
			tags: tagsByBook.get(row.userBookId) ?? []
		}))
	);

	return yamlResponse(yaml);
}

function yamlResponse(body: string): Response {
	return new Response(body, {
		headers: {
			'Content-Type': 'text/yaml; charset=utf-8',
			'Content-Disposition': 'attachment; filename="library.yaml"'
		}
	});
}

type BookExport = {
	title: string;
	authors: string[];
	isbn: string | null;
	coverUrl: string | null;
	publishYear: number | null;
	rating: number | null;
	notes: string | null;
	tags: string[];
};

function yamlStr(s: string): string {
	if (/[:#\[\]{},&*?|<>=!%@`\n"']/.test(s) || s.trim() !== s || s === '') {
		return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
	}
	return s;
}

function serializeLibraryYaml(entries: BookExport[]): string {
	const lines: string[] = ['books:'];
	for (const b of entries) {
		lines.push(`  - title: ${yamlStr(b.title)}`);
		lines.push(`    authors: [${b.authors.map(yamlStr).join(', ')}]`);
		if (b.isbn) lines.push(`    isbn: ${yamlStr(b.isbn)}`);
		if (b.coverUrl) lines.push(`    cover_url: ${yamlStr(b.coverUrl)}`);
		if (b.publishYear !== null) lines.push(`    publish_year: ${b.publishYear}`);
		if (b.rating !== null) lines.push(`    rating: ${b.rating}`);
		if (b.notes) lines.push(`    notes: ${yamlStr(b.notes)}`);
		if (b.tags.length > 0) lines.push(`    tags: [${b.tags.map(yamlStr).join(', ')}]`);
	}
	return lines.join('\n') + '\n';
}
