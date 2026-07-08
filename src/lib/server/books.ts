import { nanoid } from 'nanoid';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { db } from './db/index';
import { books, userBooks, tags, userBookTags } from './db/schema';
import { withRLS } from './db/rls';
import { getOrCreateDefaultLibrary } from './libraries';
import { searchByIsbn, getWorkById, type OpenLibraryBook } from './openlibrary';

export const LIBRARY_RECENT_LIMIT = 50;

// ─── COALESCE helpers ─────────────────────────────────────────────────────────
// userBooks fields take priority over books fields (manual-entry override).
// When bookId IS NULL, all books.* are NULL (LEFT JOIN), so COALESCE returns
// the userBooks value.

const effectiveTitle = sql<string>`COALESCE(${userBooks.title}, ${books.title})`;
const effectiveAuthors = sql<string[]>`COALESCE(${userBooks.authors}, ${books.authors})`;
const effectivePublishYear = sql<
	number | null
>`COALESCE(${userBooks.publishYear}, ${books.publishYear})`;
const effectiveDescription = sql<
	string | null
>`COALESCE(${userBooks.description}, ${books.description})`;
const effectiveIsbn = sql<string | null>`COALESCE(${userBooks.isbn}, ${books.isbn})`;

// ─── Upsert libro en catálogo global ─────────────────────────────────────────
// Si el libro ya existe por workId lo devuelve sin tocar; si no, lo inserta.
// Se llama con el usuario root (sin RLS) porque books es catálogo global.

export async function upsertBook(data: OpenLibraryBook): Promise<string> {
	const existing = await db.select({ id: books.id }).from(books).where(eq(books.id, data.id));
	if (existing.length > 0) return existing[0].id;

	await db.insert(books).values({
		id: data.id,
		isbn: data.isbn,
		title: data.title,
		authors: data.authors,
		coverUrl: data.coverUrl,
		publishYear: data.publishYear,
		publisher: data.publisher,
		language: data.language,
		description: data.description,
		openlibraryData: data.openlibraryData
	});

	return data.id;
}

// ─── Añadir libro a la biblioteca del usuario ─────────────────────────────────

type BookSource =
	| { bookId: string; title?: undefined }
	| {
			bookId: null;
			title: string;
			authors?: string[];
			isbn?: string;
			description?: string;
			publishYear?: number;
	  };

export async function addBookToLibrary(
	userId: string,
	source: BookSource,
	notes?: string,
	libraryId?: string
): Promise<string> {
	return withRLS(userId, async (tx) => {
		if (source.bookId !== null) {
			// OpenLibrary book — check for duplicates
			const dup = await tx
				.select({ id: userBooks.id })
				.from(userBooks)
				.where(eq(userBooks.bookId, source.bookId));

			if (dup.length > 0) return dup[0].id;
		}

		const resolvedLibraryId = libraryId ?? (await getOrCreateDefaultLibrary(userId, tx));

		const id = nanoid();
		await tx.insert(userBooks).values({
			id,
			userId,
			libraryId: resolvedLibraryId,
			bookId: source.bookId ?? null,
			title: source.bookId === null ? source.title : null,
			authors: source.bookId === null ? (source.authors ?? null) : null,
			isbn: source.bookId === null ? (source.isbn ?? null) : null,
			description: source.bookId === null ? (source.description ?? null) : null,
			publishYear: source.bookId === null ? (source.publishYear ?? null) : null,
			notes: notes ?? null,
			isAvailable: true
		});
		return id;
	});
}

// ─── Listar libros del usuario con sus etiquetas ──────────────────────────────

export type UserBookWithDetails = {
	userBookId: string;
	ownerId: string;
	libraryId: string;
	bookId: string | null;
	title: string;
	authors: string[];
	coverUrl: string | null;
	isbn: string | null;
	publishYear: number | null;
	description: string | null;
	isAvailable: boolean;
	notes: string | null;
	addedAt: Date;
	tags: { id: string; name: string; color: string | null }[];
};

export type LibraryFilter =
	| { type: 'recent'; limit?: number }
	| { type: 'all' }
	| { type: 'library'; libraryId: string }
	| { type: 'letter'; letter: string; by: 'title' | 'author' };

export async function getUserBooks(
	userId: string,
	filter: LibraryFilter = { type: 'recent', limit: LIBRARY_RECENT_LIMIT }
): Promise<UserBookWithDetails[]> {
	return withRLS(userId, async (tx) => {
		const base = tx
			.select({
				userBookId: userBooks.id,
				ownerId: userBooks.userId,
				libraryId: userBooks.libraryId,
				bookId: userBooks.bookId,
				title: effectiveTitle,
				authors: effectiveAuthors,
				coverUrl: books.coverUrl,
				isbn: effectiveIsbn,
				publishYear: effectivePublishYear,
				description: effectiveDescription,
				isAvailable: userBooks.isAvailable,
				notes: userBooks.notes,
				addedAt: userBooks.addedAt
			})
			.from(userBooks)
			.leftJoin(books, eq(userBooks.bookId, books.id));

		let rows;
		if (filter.type === 'recent') {
			rows = await base
				.where(eq(userBooks.userId, userId))
				.orderBy(desc(userBooks.addedAt))
				.limit(filter.limit ?? LIBRARY_RECENT_LIMIT);
		} else if (filter.type === 'all') {
			rows = await base
				.where(eq(userBooks.userId, userId))
				.orderBy(sql`COALESCE(${userBooks.title}, ${books.title}) ASC`);
		} else if (filter.type === 'library') {
			rows = await base
				.where(and(eq(userBooks.userId, userId), eq(userBooks.libraryId, filter.libraryId)))
				.orderBy(sql`COALESCE(${userBooks.title}, ${books.title}) ASC`);
		} else if (filter.by === 'title') {
			rows = await base
				.where(
					and(
						eq(userBooks.userId, userId),
						sql`upper(left(COALESCE(${userBooks.title}, ${books.title}), 1)) = ${filter.letter}`
					)
				)
				.orderBy(sql`COALESCE(${userBooks.title}, ${books.title}) ASC`);
		} else {
			// by author: only the first author (index 0) determines the letter
			rows = await base
				.where(
					and(
						eq(userBooks.userId, userId),
						sql`upper(left(COALESCE(${userBooks.authors}, ${books.authors})[1], 1)) = ${filter.letter}`
					)
				)
				.orderBy(sql`COALESCE(${userBooks.authors}, ${books.authors})[1] ASC`);
		}

		if (rows.length === 0) return [];

		const userBookIds = rows.map((r) => r.userBookId);
		const allTags = await tx
			.select({
				userBookId: userBookTags.userBookId,
				id: tags.id,
				name: tags.name,
				color: tags.color
			})
			.from(userBookTags)
			.innerJoin(tags, eq(userBookTags.tagId, tags.id))
			.where(inArray(userBookTags.userBookId, userBookIds));

		const tagsByBook = new Map<string, { id: string; name: string; color: string | null }[]>();
		for (const tag of allTags) {
			const list = tagsByBook.get(tag.userBookId) ?? [];
			list.push({ id: tag.id, name: tag.name, color: tag.color });
			tagsByBook.set(tag.userBookId, list);
		}

		return rows.map((row) => ({
			...row,
			authors: row.authors ?? [],
			tags: tagsByBook.get(row.userBookId) ?? []
		}));
	});
}

// ─── Libros de un contacto (RLS del viewer) ───────────────────────────────────

export async function getContactBooks(
	viewerId: string,
	contactId: string
): Promise<UserBookWithDetails[]> {
	return withRLS(viewerId, async (tx) => {
		const rows = await tx
			.select({
				userBookId: userBooks.id,
				ownerId: userBooks.userId,
				libraryId: userBooks.libraryId,
				bookId: userBooks.bookId,
				title: effectiveTitle,
				authors: effectiveAuthors,
				coverUrl: books.coverUrl,
				isbn: effectiveIsbn,
				publishYear: effectivePublishYear,
				description: effectiveDescription,
				isAvailable: userBooks.isAvailable,
				notes: userBooks.notes,
				addedAt: userBooks.addedAt
			})
			.from(userBooks)
			.leftJoin(books, eq(userBooks.bookId, books.id))
			.where(eq(userBooks.userId, contactId))
			.orderBy(sql`COALESCE(${userBooks.title}, ${books.title}) ASC`);

		if (rows.length === 0) return [];

		const userBookIds = rows.map((r) => r.userBookId);
		const allTags = await tx
			.select({
				userBookId: userBookTags.userBookId,
				id: tags.id,
				name: tags.name,
				color: tags.color
			})
			.from(userBookTags)
			.innerJoin(tags, eq(userBookTags.tagId, tags.id))
			.where(inArray(userBookTags.userBookId, userBookIds));

		const tagsByBook = new Map<string, { id: string; name: string; color: string | null }[]>();
		for (const tag of allTags) {
			const list = tagsByBook.get(tag.userBookId) ?? [];
			list.push({ id: tag.id, name: tag.name, color: tag.color });
			tagsByBook.set(tag.userBookId, list);
		}

		return rows.map((row) => ({
			...row,
			authors: row.authors ?? [],
			tags: tagsByBook.get(row.userBookId) ?? []
		}));
	});
}

// ─── Letras disponibles en la biblioteca ─────────────────────────────────────

export async function getLibraryLetters(userId: string, by: 'title' | 'author'): Promise<string[]> {
	return withRLS(userId, async (tx) => {
		const rows =
			by === 'title'
				? await tx.execute<{ letter: string }>(sql`
						select distinct upper(left(COALESCE(${userBooks.title}, ${books.title}), 1)) as letter
						from ${userBooks}
						left join ${books} on ${userBooks.bookId} = ${books.id}
						order by 1
					`)
				: await tx.execute<{ letter: string }>(sql`
						select distinct upper(left(COALESCE(${userBooks.authors}, ${books.authors})[1], 1)) as letter
						from ${userBooks}
						left join ${books} on ${userBooks.bookId} = ${books.id}
						order by 1
					`);
		return rows.map((r) => r.letter).filter((l) => /^[A-Z]$/.test(l));
	});
}

// ─── Obtener un libro del usuario por userBookId ──────────────────────────────

export async function getUserBook(
	userId: string,
	userBookId: string
): Promise<UserBookWithDetails | null> {
	return withRLS(userId, async (tx) => {
		const rows = await tx
			.select({
				userBookId: userBooks.id,
				ownerId: userBooks.userId,
				libraryId: userBooks.libraryId,
				bookId: userBooks.bookId,
				title: effectiveTitle,
				authors: effectiveAuthors,
				coverUrl: books.coverUrl,
				isbn: effectiveIsbn,
				publishYear: effectivePublishYear,
				description: effectiveDescription,
				isAvailable: userBooks.isAvailable,
				notes: userBooks.notes,
				addedAt: userBooks.addedAt
			})
			.from(userBooks)
			.leftJoin(books, eq(userBooks.bookId, books.id))
			.where(eq(userBooks.id, userBookId));

		if (rows.length === 0) return null;

		const bookTags = await tx
			.select({ id: tags.id, name: tags.name, color: tags.color })
			.from(userBookTags)
			.innerJoin(tags, eq(userBookTags.tagId, tags.id))
			.where(eq(userBookTags.userBookId, userBookId));

		return { ...rows[0], authors: rows[0].authors ?? [], tags: bookTags };
	});
}

// ─── Actualizar notas / disponibilidad ────────────────────────────────────────

export async function updateUserBook(
	userId: string,
	userBookId: string,
	data: { notes?: string; isAvailable?: boolean }
): Promise<void> {
	await withRLS(userId, async (tx) => {
		await tx
			.update(userBooks)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(userBooks.id, userBookId));
	});
}

// ─── Eliminar libro de la biblioteca ─────────────────────────────────────────

export async function removeFromLibrary(userId: string, userBookId: string): Promise<void> {
	await withRLS(userId, async (tx) => {
		await tx.delete(userBooks).where(eq(userBooks.id, userBookId));
	});
}

// ─── Resolver libro desde ISBN o workId ──────────────────────────────────────
// Busca en la BD primero; si no existe, va a OpenLibrary.

export async function resolveBook(isbnOrWorkId: string): Promise<OpenLibraryBook | null> {
	const normalized = isbnOrWorkId.replace(/[-\s]/g, '');
	const isIsbn = /^(?:\d{9}[\dXx]|\d{13})$/.test(normalized);

	if (isIsbn) {
		const clean = isbnOrWorkId.replace(/[^0-9X]/gi, '');
		// Comprobar si ya tenemos el libro en BD por ISBN
		const existing = await db.select().from(books).where(eq(books.isbn, clean));
		if (existing.length > 0) {
			return {
				id: existing[0].id,
				isbn: existing[0].isbn,
				title: existing[0].title,
				authors: existing[0].authors ?? [],
				coverUrl: existing[0].coverUrl,
				publishYear: existing[0].publishYear,
				publisher: existing[0].publisher,
				language: existing[0].language,
				description: existing[0].description,
				openlibraryData: existing[0].openlibraryData ?? '{}'
			};
		}
		return searchByIsbn(clean);
	}

	// Es un workId
	const existing = await db.select().from(books).where(eq(books.id, isbnOrWorkId));
	if (existing.length > 0) {
		return {
			id: existing[0].id,
			isbn: existing[0].isbn,
			title: existing[0].title,
			authors: existing[0].authors ?? [],
			coverUrl: existing[0].coverUrl,
			publishYear: existing[0].publishYear,
			publisher: existing[0].publisher,
			language: existing[0].language,
			description: existing[0].description,
			openlibraryData: existing[0].openlibraryData ?? '{}'
		};
	}
	return getWorkById(isbnOrWorkId);
}
