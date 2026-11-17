// Exportar todo lo del usuario: sus bibliotecas y, en cada una, sus libros y
// películas, con etiquetas, notas y puntuación propia. Solo lo suyo: con RLS,
// user_books y user_movies devuelven también lo que otros comparten con él en
// sus grupos o le prestan, así que se filtra por dueño.
import { eq, and, inArray, sql } from 'drizzle-orm';
import { withRLS } from './db/rls';
import {
	books,
	userBooks,
	userBookTags,
	tags,
	bookReviews,
	movieReviews,
	libraries
} from './db/schema';
import { getUserMovies } from './movies';

export type BookExport = {
	title: string;
	alternateTitle: string | null;
	authors: string[];
	isbn: string | null;
	coverUrl: string | null;
	publishYear: number | null;
	rating: number | null;
	notes: string | null;
	tags: string[];
	addedAt: Date;
};

export type MovieExport = {
	title: string;
	originalTitle: string | null;
	directors: string[];
	releaseYear: number | null;
	format: string;
	edition: string | null;
	tmdbId: string | null;
	coverUrl: string | null;
	rating: number | null;
	notes: string | null;
	tags: string[];
	addedAt: Date;
};

export type LibraryExport = {
	name: string;
	isDefault: boolean;
	books: BookExport[];
	movies: MovieExport[];
};

export async function getExportData(userId: string): Promise<LibraryExport[]> {
	const { libraryRows, bookRows, bookTags, bookRatings } = await withRLS(userId, async (tx) => {
		const libraryRows = await tx
			.select({ id: libraries.id, name: libraries.name, isDefault: libraries.isDefault })
			.from(libraries)
			.where(eq(libraries.userId, userId))
			// La predeterminada primero, luego por nombre
			.orderBy(sql`${libraries.isDefault} DESC`, sql`lower(${libraries.name})`);

		const bookRows = await tx
			.select({
				userBookId: userBooks.id,
				libraryId: userBooks.libraryId,
				bookId: userBooks.bookId,
				title: sql<string>`COALESCE(${userBooks.title}, ${books.title})`,
				alternateTitle: sql<
					string | null
				>`COALESCE(${userBooks.alternateTitle}, ${books.alternateTitle})`,
				authors: sql<string[] | null>`COALESCE(${userBooks.authors}, ${books.authors})`,
				isbn: sql<string | null>`COALESCE(${userBooks.isbn}, ${books.isbn})`,
				coverUrl: sql<string | null>`COALESCE(${userBooks.coverUrl}, ${books.coverUrl})`,
				publishYear: sql<number | null>`COALESCE(${userBooks.publishYear}, ${books.publishYear})`,
				notes: userBooks.notes,
				addedAt: userBooks.addedAt
			})
			.from(userBooks)
			.leftJoin(books, eq(userBooks.bookId, books.id))
			// Solo los suyos. Además, abajo solo se colocan en sus bibliotecas: lo ajeno caería fuera
			.where(eq(userBooks.userId, userId))
			.orderBy(sql`lower(COALESCE(${userBooks.title}, ${books.title}))`);

		const userBookIds = bookRows.map((r) => r.userBookId);
		const bookIds = [...new Set(bookRows.flatMap((r) => (r.bookId ? [r.bookId] : [])))];

		const bookTags =
			userBookIds.length > 0
				? await tx
						.select({ userBookId: userBookTags.userBookId, name: tags.name })
						.from(userBookTags)
						.innerJoin(tags, eq(userBookTags.tagId, tags.id))
						.where(inArray(userBookTags.userBookId, userBookIds))
						.orderBy(tags.name)
				: [];

		const bookRatings =
			bookIds.length > 0
				? await tx
						.select({ bookId: bookReviews.bookId, rating: bookReviews.rating })
						.from(bookReviews)
						.where(and(inArray(bookReviews.bookId, bookIds), eq(bookReviews.userId, userId)))
				: [];

		return { libraryRows, bookRows, bookTags, bookRatings };
	});

	// getUserMovies ya filtra por dueño
	const movieRows = await getUserMovies(userId);
	const movieIds = [...new Set(movieRows.flatMap((m) => (m.movieId ? [m.movieId] : [])))];
	const movieRatings =
		movieIds.length > 0
			? await withRLS(userId, (tx) =>
					tx
						.select({ movieId: movieReviews.movieId, rating: movieReviews.rating })
						.from(movieReviews)
						.where(and(inArray(movieReviews.movieId, movieIds), eq(movieReviews.userId, userId)))
				)
			: [];

	const tagsByBook = new Map<string, string[]>();
	for (const t of bookTags) {
		const list = tagsByBook.get(t.userBookId) ?? [];
		list.push(t.name);
		tagsByBook.set(t.userBookId, list);
	}
	const bookRating = new Map(bookRatings.map((r) => [r.bookId, r.rating]));
	const movieRating = new Map(movieRatings.map((r) => [r.movieId, r.rating]));

	const byLibrary = new Map<string, LibraryExport>(
		libraryRows.map((lib) => [
			lib.id,
			{ name: lib.name, isDefault: lib.isDefault, books: [], movies: [] }
		])
	);

	for (const b of bookRows) {
		byLibrary.get(b.libraryId)?.books.push({
			title: b.title,
			alternateTitle: b.alternateTitle,
			authors: b.authors ?? [],
			isbn: b.isbn,
			coverUrl: b.coverUrl,
			publishYear: b.publishYear,
			rating: b.bookId ? (bookRating.get(b.bookId) ?? null) : null,
			notes: b.notes,
			tags: tagsByBook.get(b.userBookId) ?? [],
			addedAt: b.addedAt
		});
	}

	for (const m of movieRows) {
		byLibrary.get(m.libraryId)?.movies.push({
			title: m.title,
			originalTitle: m.originalTitle,
			directors: m.directors,
			releaseYear: m.releaseYear,
			format: m.format,
			edition: m.edition,
			tmdbId: m.movieId?.replace('tmdb-', '') ?? null,
			coverUrl: m.coverUrl,
			rating: m.movieId ? (movieRating.get(m.movieId) ?? null) : null,
			notes: m.notes,
			tags: m.tags.map((t) => t.name),
			addedAt: m.addedAt
		});
	}

	return [...byLibrary.values()];
}

// ─── YAML ─────────────────────────────────────────────────────────────────────

function yamlStr(s: string): string {
	if (/[:#[\]{},&*?|<>=!%@`\n"']/.test(s) || s.trim() !== s || s === '') {
		return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
	}
	return s;
}

const yamlList = (items: string[]) => `[${items.map(yamlStr).join(', ')}]`;
const day = (d: Date) => d.toISOString().slice(0, 10);

// Las fotos propias (/api/…/cover) solo se ven con sesión: no se exportan.
const publicCover = (url: string | null) => (url?.startsWith('https://') ? url : null);

export function serializeExportYaml(data: LibraryExport[], exportedAt = new Date()): string {
	const lines = [`exported_at: ${exportedAt.toISOString()}`, 'libraries:'];
	if (data.length === 0) lines[1] = 'libraries: []';

	for (const lib of data) {
		lines.push(`  - name: ${yamlStr(lib.name)}`);
		if (lib.isDefault) lines.push('    default: true');

		lines.push(lib.books.length > 0 ? '    books:' : '    books: []');
		for (const b of lib.books) {
			lines.push(`      - title: ${yamlStr(b.title)}`);
			if (b.alternateTitle) lines.push(`        alternate_title: ${yamlStr(b.alternateTitle)}`);
			lines.push(`        authors: ${yamlList(b.authors)}`);
			if (b.isbn) lines.push(`        isbn: ${yamlStr(b.isbn)}`);
			if (b.publishYear !== null) lines.push(`        publish_year: ${b.publishYear}`);
			const cover = publicCover(b.coverUrl);
			if (cover) lines.push(`        cover_url: ${yamlStr(cover)}`);
			if (b.rating !== null) lines.push(`        rating: ${b.rating}`);
			if (b.notes) lines.push(`        notes: ${yamlStr(b.notes)}`);
			if (b.tags.length > 0) lines.push(`        tags: ${yamlList(b.tags)}`);
			lines.push(`        added: ${day(b.addedAt)}`);
		}

		lines.push(lib.movies.length > 0 ? '    movies:' : '    movies: []');
		for (const m of lib.movies) {
			lines.push(`      - title: ${yamlStr(m.title)}`);
			if (m.originalTitle) lines.push(`        original_title: ${yamlStr(m.originalTitle)}`);
			if (m.directors.length > 0) lines.push(`        directors: ${yamlList(m.directors)}`);
			if (m.releaseYear !== null) lines.push(`        release_year: ${m.releaseYear}`);
			lines.push(`        format: ${m.format}`);
			if (m.edition) lines.push(`        edition: ${yamlStr(m.edition)}`);
			if (m.tmdbId) lines.push(`        tmdb_id: ${m.tmdbId}`);
			const cover = publicCover(m.coverUrl);
			if (cover) lines.push(`        cover_url: ${yamlStr(cover)}`);
			if (m.rating !== null) lines.push(`        rating: ${m.rating}`);
			if (m.notes) lines.push(`        notes: ${yamlStr(m.notes)}`);
			if (m.tags.length > 0) lines.push(`        tags: ${yamlList(m.tags)}`);
			lines.push(`        added: ${day(m.addedAt)}`);
		}
	}
	return lines.join('\n') + '\n';
}

// ─── JSON ─────────────────────────────────────────────────────────────────────

export function serializeExportJson(data: LibraryExport[], exportedAt = new Date()): string {
	const libraries = data.map((lib) => ({
		...lib,
		books: lib.books.map((b) => ({ ...b, coverUrl: publicCover(b.coverUrl) })),
		movies: lib.movies.map((m) => ({ ...m, coverUrl: publicCover(m.coverUrl) }))
	}));
	return JSON.stringify({ exportedAt: exportedAt.toISOString(), libraries }, null, 2) + '\n';
}

// ─── BibTeX (solo libros: es un formato de bibliografía) ──────────────────────

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

export function serializeExportBibTex(data: LibraryExport[]): string {
	const entries = data.flatMap((lib) => lib.books);
	if (entries.length === 0) return '% Empty library\n';

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
