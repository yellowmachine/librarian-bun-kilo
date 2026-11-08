import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { eq, inArray, and, sql } from 'drizzle-orm';
import { withRLS } from '$lib/server/db/rls';
import { books, userBooks, userBookTags, tags, bookReviews } from '$lib/server/db/schema';
import { getUserMovies, type UserMovieWithDetails } from '$lib/server/movies';

// GET /api/export?format=yaml|bibtex
export async function GET({ locals, url }: RequestEvent) {
	if (!locals.user) error(401, 'Not authenticated');

	const format = url.searchParams.get('format') ?? 'yaml';
	if (format !== 'yaml' && format !== 'bibtex') error(400, 'format must be yaml or bibtex');

	const userId = locals.user.id;

	const rows = await withRLS(userId, (tx) =>
		tx
			.select({
				userBookId: userBooks.id,
				bookId: userBooks.bookId,
				title: sql<string>`COALESCE(${userBooks.title}, ${books.title})`,
				authors: sql<string[]>`COALESCE(${userBooks.authors}, ${books.authors})`,
				isbn: sql<string | null>`COALESCE(${userBooks.isbn}, ${books.isbn})`,
				coverUrl: sql<string | null>`COALESCE(${userBooks.coverUrl}, ${books.coverUrl})`,
				publishYear: sql<number | null>`COALESCE(${userBooks.publishYear}, ${books.publishYear})`,
				notes: userBooks.notes
			})
			.from(userBooks)
			.leftJoin(books, eq(userBooks.bookId, books.id))
			.orderBy(sql`COALESCE(${userBooks.title}, ${books.title})`)
	);

	// La videoteca solo sale en YAML: BibTeX es un formato de bibliografía.
	const userMovies = format === 'yaml' ? await getUserMovies(userId) : [];

	if (rows.length === 0) {
		return format === 'bibtex'
			? bibtexResponse('% Empty library\n')
			: yamlResponse('books: []\n' + serializeMoviesYaml(userMovies));
	}

	const bookIds = [...new Set(rows.map((r) => r.bookId).filter((id): id is string => id !== null))];
	const userBookIds = rows.map((r) => r.userBookId);

	const [allTags, ownRatings] = await Promise.all([
		withRLS(userId, (tx) =>
			tx
				.select({ userBookId: userBookTags.userBookId, name: tags.name })
				.from(userBookTags)
				.innerJoin(tags, eq(userBookTags.tagId, tags.id))
				.where(inArray(userBookTags.userBookId, userBookIds))
		),
		bookIds.length > 0
			? withRLS(userId, (tx) =>
					tx
						.select({ bookId: bookReviews.bookId, rating: bookReviews.rating })
						.from(bookReviews)
						.where(and(inArray(bookReviews.bookId, bookIds), eq(bookReviews.userId, userId)))
				)
			: Promise.resolve([])
	]);

	const tagsByBook = new Map<string, string[]>();
	for (const t of allTags) {
		const list = tagsByBook.get(t.userBookId) ?? [];
		list.push(t.name);
		tagsByBook.set(t.userBookId, list);
	}

	const ratingByBook = new Map(ownRatings.map((r) => [r.bookId, r.rating]));

	const entries = rows.map((row) => ({
		title: row.title,
		authors: row.authors ?? [],
		isbn: row.isbn ?? null,
		coverUrl: row.coverUrl ?? null,
		publishYear: row.publishYear ?? null,
		rating: row.bookId ? (ratingByBook.get(row.bookId) ?? null) : null,
		notes: row.notes ?? null,
		tags: tagsByBook.get(row.userBookId) ?? []
	}));

	if (format === 'bibtex') {
		return bibtexResponse(serializeLibraryBibTex(entries));
	}
	return yamlResponse(serializeLibraryYaml(entries) + serializeMoviesYaml(userMovies));
}

// ─── Responses ────────────────────────────────────────────────────────────────

function yamlResponse(body: string): Response {
	return new Response(body, {
		headers: {
			'Content-Type': 'text/yaml; charset=utf-8',
			'Content-Disposition': 'attachment; filename="library.yaml"'
		}
	});
}

function bibtexResponse(body: string): Response {
	return new Response(body, {
		headers: {
			'Content-Type': 'application/x-bibtex; charset=utf-8',
			'Content-Disposition': 'attachment; filename="library.bib"'
		}
	});
}

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── YAML ─────────────────────────────────────────────────────────────────────

function yamlStr(s: string): string {
	if (/[:#[\]{},&*?|<>=!%@`\n"']/.test(s) || s.trim() !== s || s === '') {
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

function serializeMoviesYaml(entries: UserMovieWithDetails[]): string {
	if (entries.length === 0) return '';
	const lines: string[] = ['movies:'];
	for (const m of entries) {
		lines.push(`  - title: ${yamlStr(m.title)}`);
		if (m.originalTitle) lines.push(`    original_title: ${yamlStr(m.originalTitle)}`);
		if (m.directors.length > 0)
			lines.push(`    directors: [${m.directors.map(yamlStr).join(', ')}]`);
		if (m.releaseYear !== null) lines.push(`    release_year: ${m.releaseYear}`);
		lines.push(`    format: ${m.format}`);
		if (m.edition) lines.push(`    edition: ${yamlStr(m.edition)}`);
		if (m.movieId) lines.push(`    tmdb_id: ${m.movieId.replace('tmdb-', '')}`);
		// La foto propia (/api/movies/…/cover) solo se ve con sesión: no se exporta.
		if (m.coverUrl?.startsWith('https://')) lines.push(`    cover_url: ${yamlStr(m.coverUrl)}`);
		if (m.notes) lines.push(`    notes: ${yamlStr(m.notes)}`);
		if (m.tags.length > 0)
			lines.push(`    tags: [${m.tags.map((t) => yamlStr(t.name)).join(', ')}]`);
	}
	return lines.join('\n') + '\n';
}

// ─── BibTeX ───────────────────────────────────────────────────────────────────

function bibTexEscape(s: string): string {
	return s
		.replace(/\\/g, '\\textbackslash{}')
		.replace(/[&%$#_^~]/g, (c) => `\\${c}`)
		.replace(/\{/g, '\\{')
		.replace(/\}/g, '\\}');
}

function makeBibKey(authors: string[], year: number | null, usedKeys: Set<string>): string {
	const surname = authors[0]
		? (authors[0].split(' ').at(-1) ?? authors[0]).toLowerCase().replace(/[^a-z]/g, '')
		: 'unknown';
	const yr = year ? String(year) : 'nd';
	let key = `${surname}${yr}`;
	let suffix = 1;
	while (usedKeys.has(key)) {
		key = `${surname}${yr}${String.fromCharCode(96 + suffix)}`; // a, b, c …
		suffix++;
	}
	usedKeys.add(key);
	return key;
}

function serializeLibraryBibTex(entries: BookExport[]): string {
	const usedKeys = new Set<string>();
	const blocks: string[] = [];

	for (const b of entries) {
		const key = makeBibKey(b.authors, b.publishYear, usedKeys);
		const fields: string[] = [];

		fields.push(`  title     = {${bibTexEscape(b.title)}}`);
		if (b.authors.length > 0) {
			fields.push(`  author    = {${b.authors.map(bibTexEscape).join(' and ')}}`);
		}
		if (b.publishYear !== null) fields.push(`  year      = {${b.publishYear}}`);
		if (b.isbn) fields.push(`  isbn      = {${b.isbn}}`);
		if (b.rating !== null) fields.push(`  rating    = {${b.rating}}`);
		if (b.tags.length > 0) fields.push(`  keywords  = {${b.tags.map(bibTexEscape).join(', ')}}`);
		if (b.notes) fields.push(`  annote    = {${bibTexEscape(b.notes)}}`);

		blocks.push(`@book{${key},\n${fields.join(',\n')}\n}`);
	}

	return blocks.join('\n\n') + '\n';
}
