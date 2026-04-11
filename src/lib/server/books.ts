import { nanoid } from 'nanoid';
import { eq, desc, asc, inArray, sql } from 'drizzle-orm';
import { db } from './db/index';
import { books, userBooks, tags, userBookTags } from './db/schema';
import { withRLS } from './db/rls';
import { searchByIsbn, getWorkById, type OpenLibraryBook } from './openlibrary';

export const LIBRARY_RECENT_LIMIT = 50;

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

export async function addBookToLibrary(
	userId: string,
	bookId: string,
	notes?: string
): Promise<string> {
	return withRLS(userId, async (tx) => {
		// Verificar si ya tiene este libro concreto (RLS filtra por userId automáticamente)
		const dup = await tx
			.select({ id: userBooks.id })
			.from(userBooks)
			.where(eq(userBooks.bookId, bookId));

		if (dup.length > 0) return dup[0].id;

		const id = nanoid();
		await tx.insert(userBooks).values({
			id,
			userId,
			bookId,
			notes: notes ?? null,
			isAvailable: true
		});
		return id;
	});
}

// ─── Listar libros del usuario con sus etiquetas ──────────────────────────────

export type UserBookWithDetails = {
	userBookId: string;
	bookId: string;
	title: string;
	authors: string[];
	coverUrl: string | null;
	publishYear: number | null;
	description: string | null;
	isAvailable: boolean;
	notes: string | null;
	addedAt: Date;
	tags: { id: string; name: string; color: string | null }[];
};

export type LibraryFilter =
	| { type: 'recent'; limit?: number }
	| { type: 'letter'; letter: string; by: 'title' | 'author' };

export async function getUserBooks(
	userId: string,
	filter: LibraryFilter = { type: 'recent', limit: LIBRARY_RECENT_LIMIT }
): Promise<UserBookWithDetails[]> {
	return withRLS(userId, async (tx) => {
		const base = tx
			.select({
				userBookId: userBooks.id,
				bookId: books.id,
				title: books.title,
				authors: books.authors,
				coverUrl: books.coverUrl,
				publishYear: books.publishYear,
				description: books.description,
				isAvailable: userBooks.isAvailable,
				notes: userBooks.notes,
				addedAt: userBooks.addedAt
			})
			.from(userBooks)
			.innerJoin(books, eq(userBooks.bookId, books.id));

		let rows;
		if (filter.type === 'recent') {
			rows = await base
				.orderBy(desc(userBooks.addedAt))
				.limit(filter.limit ?? LIBRARY_RECENT_LIMIT);
		} else if (filter.by === 'title') {
			rows = await base
				.where(sql`upper(left(${books.title}, 1)) = ${filter.letter}`)
				.orderBy(asc(books.title));
		} else {
			// by author: any author in the array starts with the letter
			rows = await base
				.where(
					sql`exists(select 1 from unnest(${books.authors}) a where upper(left(a, 1)) = ${filter.letter})`
				)
				.orderBy(asc(books.title));
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

// ─── Letras disponibles en la biblioteca ─────────────────────────────────────

export async function getLibraryLetters(
	userId: string,
	by: 'title' | 'author'
): Promise<string[]> {
	return withRLS(userId, async (tx) => {
		const rows =
			by === 'title'
				? await tx.execute<{ letter: string }>(sql`
						select distinct upper(left(${books.title}, 1)) as letter
						from ${userBooks}
						inner join ${books} on ${userBooks.bookId} = ${books.id}
						order by 1
					`)
				: await tx.execute<{ letter: string }>(sql`
						select distinct upper(left(a, 1)) as letter
						from ${userBooks}
						inner join ${books} on ${userBooks.bookId} = ${books.id},
						unnest(${books.authors}) a
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
				bookId: books.id,
				title: books.title,
				authors: books.authors,
				coverUrl: books.coverUrl,
				publishYear: books.publishYear,
				description: books.description,
				isAvailable: userBooks.isAvailable,
				notes: userBooks.notes,
				addedAt: userBooks.addedAt
			})
			.from(userBooks)
			.innerJoin(books, eq(userBooks.bookId, books.id))
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
	const isIsbn = /^[0-9]{10,13}$/.test(isbnOrWorkId.replace(/-/g, ''));

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
