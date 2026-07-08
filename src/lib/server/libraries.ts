import { nanoid } from 'nanoid';
import { eq, and, sql } from 'drizzle-orm';
import { db } from './db/index';
import { libraries, userBooks } from './db/schema';
import { withRLS } from './db/rls';

export const DEFAULT_LIBRARY_NAME = 'Default';

// ─── Biblioteca default del usuario ───────────────────────────────────────────
// Se crea de forma perezosa la primera vez que hace falta (no en el signup,
// que hoy no tiene ningún hook de creación de filas por-usuario). El llamador
// debe pasar la transacción de un withRLS ya abierto.

export async function getOrCreateDefaultLibrary(userId: string, tx: typeof db): Promise<string> {
	const existing = await tx
		.select({ id: libraries.id })
		.from(libraries)
		.where(and(eq(libraries.userId, userId), eq(libraries.isDefault, true)));

	if (existing.length > 0) return existing[0].id;

	const id = nanoid();
	await tx.insert(libraries).values({ id, userId, name: DEFAULT_LIBRARY_NAME, isDefault: true });
	return id;
}

// ─── Listar bibliotecas del usuario con el nº de libros ───────────────────────

export type LibraryWithCount = {
	id: string;
	name: string;
	isDefault: boolean;
	bookCount: number;
	createdAt: Date;
};

export async function getUserLibraries(userId: string): Promise<LibraryWithCount[]> {
	return withRLS(userId, async (tx) => {
		await getOrCreateDefaultLibrary(userId, tx);

		return tx
			.select({
				id: libraries.id,
				name: libraries.name,
				isDefault: libraries.isDefault,
				createdAt: libraries.createdAt,
				bookCount: sql<number>`count(${userBooks.id})::int`
			})
			.from(libraries)
			.leftJoin(userBooks, eq(userBooks.libraryId, libraries.id))
			.where(eq(libraries.userId, userId))
			.groupBy(libraries.id)
			.orderBy(sql`${libraries.isDefault} DESC`, libraries.createdAt);
	});
}

// ─── Crear biblioteca ─────────────────────────────────────────────────────────

export async function createLibrary(userId: string, name: string): Promise<string> {
	return withRLS(userId, async (tx) => {
		const id = nanoid();
		await tx.insert(libraries).values({ id, userId, name, isDefault: false });
		return id;
	});
}

// ─── Mover un libro a otra biblioteca del mismo usuario ──────────────────────

export async function moveBookToLibrary(
	userId: string,
	userBookId: string,
	libraryId: string
): Promise<void> {
	await withRLS(userId, async (tx) => {
		// RLS ya limita libraries/user_books al propio usuario, pero comprobamos
		// explícitamente que el destino existe y es suyo para devolver un error claro.
		const target = await tx
			.select({ id: libraries.id })
			.from(libraries)
			.where(and(eq(libraries.id, libraryId), eq(libraries.userId, userId)));

		if (target.length === 0) throw new Error('Library not found.');

		await tx
			.update(userBooks)
			.set({ libraryId, updatedAt: new Date() })
			.where(and(eq(userBooks.id, userBookId), eq(userBooks.userId, userId)));
	});
}
