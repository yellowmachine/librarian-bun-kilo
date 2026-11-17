import { nanoid } from 'nanoid';
import { eq, and, or, inArray, sql } from 'drizzle-orm';
import { db } from './db/index';
import { loans, userBooks, books, userMovies, movies } from './db/schema';
import { user } from './db/auth.schema';
import { withRLS } from './db/rls';
import { sendLoanRequestEmail, sendLoanAcceptedEmail } from './email';

// COALESCE helpers: userBooks manual fields override books catalog fields
const effectiveTitle = sql<string>`COALESCE(${userBooks.title}, ${books.title})`;
const effectiveAuthors = sql<string[]>`COALESCE(${userBooks.authors}, ${books.authors})`;

// Lo prestado es un libro o una película: con los cuatro LEFT JOIN, solo uno
// de los dos lados trae datos y COALESCE se queda con ese. Si el dueño ya
// borró la copia, no trae ninguno y queda la foto fija del préstamo (item_*).
const itemTitle = sql<string>`COALESCE(
	${userBooks.title}, ${books.title}, ${userMovies.title}, ${movies.title}, ${loans.itemTitle}
)`;
const itemCreators = sql<string[] | null>`COALESCE(
	${userBooks.authors}, ${books.authors}, ${userMovies.directors}, ${movies.directors},
	${loans.itemCreators}
)`;
const itemCover = sql<string | null>`COALESCE(
	${userBooks.coverUrl}, ${books.coverUrl}, ${userMovies.coverUrl}, ${movies.posterUrl},
	${loans.itemCoverUrl}
)`;

const loanColumns = {
	id: loans.id,
	status: loans.status,
	requestedAt: loans.requestedAt,
	acceptedAt: loans.acceptedAt,
	activeAt: loans.activeAt,
	returnRequestedAt: loans.returnRequestedAt,
	returnedAt: loans.returnedAt,
	dueDate: loans.dueDate,
	notes: loans.notes,
	ownerNotes: loans.ownerNotes,
	itemKind: loans.itemKind,
	userBookId: loans.userBookId,
	userMovieId: loans.userMovieId,
	bookId: userBooks.bookId,
	movieId: userMovies.movieId,
	title: itemTitle,
	authors: itemCreators,
	coverUrl: itemCover,
	borrowerId: loans.borrowerId,
	ownerId: loans.ownerId,
	storedBorrowerName: loans.borrowerName,
	storedOwnerName: loans.ownerName
};

function selectLoans(tx: typeof db) {
	return tx
		.select(loanColumns)
		.from(loans)
		.leftJoin(userBooks, eq(loans.userBookId, userBooks.id))
		.leftJoin(books, eq(userBooks.bookId, books.id))
		.leftJoin(userMovies, eq(loans.userMovieId, userMovies.id))
		.leftJoin(movies, eq(userMovies.movieId, movies.id));
}

type LoanRow = Awaited<ReturnType<ReturnType<typeof selectLoans>['where']>>[number];

/** Lo que se ve en lugar de quien borró su cuenta (sin nombre guardado) */
export const DELETED_ACCOUNT = 'Cuenta borrada';

type Person = { name: string; email: string | null };

// Una de las partes: la cuenta si sigue, o lo que quedó al borrarla (el nombre
// solo en préstamos en curso, ver accountDeletion.ts).
function party(id: string | null, stored: string | null, users: Map<string, Person>) {
	const found = id ? users.get(id) : undefined;
	if (found) return { name: found.name, email: found.email ?? '', deleted: false };
	return { name: id ? '?' : (stored ?? DELETED_ACCOUNT), email: '', deleted: id === null };
}

function withParties(row: LoanRow, users: Map<string, Person>): LoanWithDetails {
	const { storedBorrowerName, storedOwnerName, ...rest } = row;
	const borrower = party(row.borrowerId, storedBorrowerName, users);
	const owner = party(row.ownerId, storedOwnerName, users);
	return {
		...rest,
		...itemFields(row),
		status: row.status as LoanStatus,
		borrowerName: borrower.name,
		borrowerEmail: borrower.email,
		borrowerDeleted: borrower.deleted,
		ownerName: owner.name,
		ownerEmail: owner.email,
		ownerDeleted: owner.deleted
	};
}

async function usersById(ids: (string | null)[]): Promise<Map<string, Person>> {
	const unique = [...new Set(ids.filter((id): id is string => id !== null))];
	if (unique.length === 0) return new Map();
	const rows = await db
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.where(inArray(user.id, unique));
	return new Map(rows.map((u) => [u.id, u]));
}

// Dónde está su ficha (null si el dueño ya borró la copia)
function itemFields(row: LoanRow) {
	return {
		itemHref: row.userMovieId
			? `/movies/${row.userMovieId}`
			: row.userBookId
				? `/library/${row.userBookId}`
				: null,
		authors: row.authors ?? []
	};
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type LoanStatus =
	| 'requested'
	| 'accepted'
	| 'active'
	| 'return_requested'
	| 'returned'
	| 'rejected'
	| 'cancelled';

export type LoanWithDetails = {
	id: string;
	status: LoanStatus;
	requestedAt: Date;
	acceptedAt: Date | null;
	activeAt: Date | null;
	returnRequestedAt: Date | null;
	returnedAt: Date | null;
	dueDate: Date | null;
	notes: string | null;
	ownerNotes: string | null;
	// Lo prestado: un libro (userBookId) o una película (userMovieId)
	itemKind: 'book' | 'movie';
	/** null si el dueño borró la copia (el préstamo queda en el historial) */
	itemHref: string | null;
	userBookId: string | null;
	userMovieId: string | null;
	bookId: string | null;
	movieId: string | null;
	title: string;
	/** Autores del libro o directores de la película */
	authors: string[];
	coverUrl: string | null;
	// Personas. Si una borró su cuenta: id null, *Deleted true, y de nombre el
	// guardado (préstamo en curso) o DELETED_ACCOUNT.
	borrowerId: string | null;
	borrowerName: string;
	borrowerEmail: string;
	borrowerDeleted: boolean;
	ownerId: string | null;
	ownerName: string;
	ownerEmail: string;
	ownerDeleted: boolean;
};

// ─── Solicitar préstamo ───────────────────────────────────────────────────────

export type LoanItem =
	| { kind: 'book'; userBookId: string }
	| { kind: 'movie'; userMovieId: string };

export async function requestLoan(
	borrowerId: string,
	item: LoanItem,
	notes?: string
): Promise<string> {
	const { loanId, ownerId, bookTitle } = await withRLS(borrowerId, async (tx) => {
		// La RLS (…_select_in_group) deja leer lo ajeno compartido por etiqueta.
		const rows =
			item.kind === 'book'
				? await tx
						.select({
							ownerId: userBooks.userId,
							isAvailable: userBooks.isAvailable,
							title: effectiveTitle,
							creators: effectiveAuthors,
							coverUrl: sql<string | null>`COALESCE(${userBooks.coverUrl}, ${books.coverUrl})`
						})
						.from(userBooks)
						.leftJoin(books, eq(userBooks.bookId, books.id))
						.where(eq(userBooks.id, item.userBookId))
				: await tx
						.select({
							ownerId: userMovies.userId,
							isAvailable: userMovies.isAvailable,
							title: sql<string>`COALESCE(${userMovies.title}, ${movies.title})`,
							creators: sql<
								string[] | null
							>`COALESCE(${userMovies.directors}, ${movies.directors})`,
							coverUrl: sql<string | null>`COALESCE(${userMovies.coverUrl}, ${movies.posterUrl})`
						})
						.from(userMovies)
						.leftJoin(movies, eq(userMovies.movieId, movies.id))
						.where(eq(userMovies.id, item.userMovieId));

		const noun = item.kind === 'book' ? 'book' : 'movie';
		if (rows.length === 0)
			throw new Error(item.kind === 'book' ? 'Book not found' : 'Movie not found');
		const { ownerId, isAvailable, title, creators, coverUrl } = rows[0];

		if (!isAvailable) throw new Error(`This ${noun} is not available.`);
		if (ownerId === borrowerId) throw new Error(`You can't request your own ${noun}.`);

		const itemMatch =
			item.kind === 'book'
				? eq(loans.userBookId, item.userBookId)
				: eq(loans.userMovieId, item.userMovieId);

		// Check for existing active/pending loan (loans are visible to both parties via RLS)
		const existing = await tx
			.select({ id: loans.id })
			.from(loans)
			.where(and(itemMatch, inArray(loans.status, ['requested', 'accepted', 'active'])));
		if (existing.length > 0)
			throw new Error(`There is already an active request for this ${noun}.`);

		const id = nanoid();
		await tx.insert(loans).values({
			id,
			itemKind: item.kind,
			// Foto fija para el historial, por si el dueño borra la copia. La
			// portada solo si es pública: la foto propia de una película se va con ella.
			itemTitle: title ?? '?',
			itemCreators: creators ?? null,
			itemCoverUrl: coverUrl?.startsWith('https://') ? coverUrl : null,
			userBookId: item.kind === 'book' ? item.userBookId : null,
			userMovieId: item.kind === 'movie' ? item.userMovieId : null,
			borrowerId,
			ownerId,
			status: 'requested',
			notes: notes ?? null
		});

		return { loanId: id, ownerId, bookTitle: title ?? '' };
	});

	// Notificar al owner — queries solo a la tabla user (sin RLS) para obtener nombres y emails
	const [borrowerRow, ownerRow] = await Promise.all([
		db.select({ name: user.name }).from(user).where(eq(user.id, borrowerId)),
		db.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, ownerId))
	]);

	if (ownerRow[0]?.email && bookTitle) {
		sendLoanRequestEmail({
			to: ownerRow[0].email,
			ownerName: ownerRow[0].name ?? '',
			borrowerName: borrowerRow[0]?.name ?? '',
			bookTitle,
			loanId,
			notes
		}).catch((err) => console.error('[email] sendLoanRequestEmail failed:', err));
	}

	return loanId;
}

// ─── Listar préstamos del usuario ─────────────────────────────────────────────

export async function getUserLoans(userId: string): Promise<{
	asOwner: LoanWithDetails[];
	asBorrower: LoanWithDetails[];
}> {
	const rows = await withRLS(userId, async (tx) => {
		// Dos queries separadas porque Drizzle no soporta bien self-joins con alias
		const ownerLoans = await selectLoans(tx).where(eq(loans.ownerId, userId));
		const borrowerLoans = await selectLoans(tx).where(eq(loans.borrowerId, userId));

		return { ownerLoans, borrowerLoans };
	});

	const users = await usersById([
		userId,
		...rows.ownerLoans.map((r) => r.borrowerId),
		...rows.borrowerLoans.map((r) => r.ownerId)
	]);

	return {
		asOwner: rows.ownerLoans.map((r) => withParties(r, users)),
		asBorrower: rows.borrowerLoans.map((r) => withParties(r, users))
	};
}

// ─── Obtener préstamo por ID ──────────────────────────────────────────────────

export async function getLoan(userId: string, loanId: string): Promise<LoanWithDetails | null> {
	const rows = await withRLS(userId, (tx) => selectLoans(tx).where(eq(loans.id, loanId)));

	if (rows.length === 0) return null;
	const row = rows[0];
	return withParties(row, await usersById([row.borrowerId, row.ownerId]));
}

// ─── Transiciones de estado ───────────────────────────────────────────────────

type StatusTransition = {
	from: LoanStatus[];
	to: LoanStatus;
	actor: 'owner' | 'borrower';
	// Campos adicionales a actualizar junto al status
	extraFields?: Partial<typeof loans.$inferInsert>;
};

const TRANSITIONS: StatusTransition[] = [
	{ from: ['requested'], to: 'accepted', actor: 'owner', extraFields: { acceptedAt: new Date() } },
	{ from: ['requested'], to: 'rejected', actor: 'owner' },
	{ from: ['requested'], to: 'cancelled', actor: 'borrower' },
	{ from: ['accepted'], to: 'active', actor: 'owner', extraFields: { activeAt: new Date() } },
	{ from: ['accepted'], to: 'cancelled', actor: 'borrower' },
	{
		from: ['active'],
		to: 'return_requested',
		actor: 'borrower',
		extraFields: { returnRequestedAt: new Date() }
	},
	{
		from: ['return_requested'],
		to: 'returned',
		actor: 'owner',
		extraFields: { returnedAt: new Date() }
	},
	{ from: ['return_requested'], to: 'active', actor: 'owner' } // owner rechaza la devolución
];

// Si la otra parte borró su cuenta con el préstamo en curso, nadie va a pedir ni
// confirmar la devolución: quien queda lo cierra (lo recuperó, o lo da por perdido).
const ORPHAN_CLOSE: LoanStatus[] = ['active', 'return_requested'];

/** Si quien mira puede cerrar el préstamo porque la otra parte ya no está */
export function canCloseOrphan(loan: LoanWithDetails, userId: string): boolean {
	const otherGone = loan.ownerId === userId ? loan.borrowerDeleted : loan.ownerDeleted;
	return otherGone && ORPHAN_CLOSE.includes(loan.status);
}

export async function transitionLoan(
	userId: string,
	loanId: string,
	toStatus: LoanStatus,
	ownerNotes?: string
): Promise<{ success: boolean; error?: string }> {
	const loan = await getLoan(userId, loanId);
	if (!loan) return { success: false, error: 'Préstamo no encontrado' };

	const isOwner = loan.ownerId === userId;
	const actor: 'owner' | 'borrower' = isOwner ? 'owner' : 'borrower';

	const transition =
		TRANSITIONS.find(
			(t) => t.to === toStatus && t.from.includes(loan.status) && t.actor === actor
		) ?? (toStatus === 'returned' && canCloseOrphan(loan, userId) ? { to: toStatus } : undefined);

	if (!transition) {
		return { success: false, error: `Transición no permitida: ${loan.status} → ${toStatus}` };
	}

	// Calcular campos extra con timestamps frescos en el momento de ejecutar
	const extraFields: Record<string, unknown> = {};
	if (toStatus === 'accepted') extraFields.acceptedAt = new Date();
	if (toStatus === 'active') extraFields.activeAt = new Date();
	if (toStatus === 'return_requested') extraFields.returnRequestedAt = new Date();
	if (toStatus === 'returned') extraFields.returnedAt = new Date();

	await withRLS(userId, async (tx) => {
		await tx
			.update(loans)
			.set({
				status: toStatus,
				...extraFields,
				...(toStatus === 'accepted' && ownerNotes ? { ownerNotes } : {})
			})
			.where(eq(loans.id, loanId));

		// Activo → no disponible; devuelto, cancelado o rechazado → disponible
		const isAvailable =
			toStatus === 'active'
				? false
				: ['returned', 'rejected', 'cancelled'].includes(toStatus)
					? true
					: null;
		if (isAvailable !== null) await setItemAvailability(tx, loan, isAvailable);
	});

	// Notificar al borrower cuando el owner acepta
	if (toStatus === 'accepted' && loan.borrowerEmail) {
		sendLoanAcceptedEmail({
			to: loan.borrowerEmail,
			borrowerName: loan.borrowerName,
			ownerName: loan.ownerName,
			bookTitle: loan.title,
			loanId,
			notes: ownerNotes ?? null
		}).catch((err) => console.error('[email] sendLoanAcceptedEmail failed:', err));
	}

	return { success: true };
}

async function setItemAvailability(
	tx: typeof db,
	loan: Pick<LoanWithDetails, 'userBookId' | 'userMovieId'>,
	isAvailable: boolean
): Promise<void> {
	const values = { isAvailable, updatedAt: new Date() };
	if (loan.userMovieId) {
		await tx.update(userMovies).set(values).where(eq(userMovies.id, loan.userMovieId));
	} else if (loan.userBookId) {
		await tx.update(userBooks).set(values).where(eq(userBooks.id, loan.userBookId));
	}
}

// ─── Cargar libro ajeno para solicitar préstamo ───────────────────────────────

export type BorrowableBook = {
	userBookId: string;
	bookId: string | null;
	title: string;
	authors: string[];
	coverUrl: string | null;
	publishYear: number | null;
	isAvailable: boolean;
	ownerId: string;
	ownerName: string;
	existingLoanId: string | null;
	existingLoanStatus: LoanStatus | null;
};

export async function getBookForBorrow(
	userId: string,
	userBookId: string
): Promise<BorrowableBook | null> {
	return withRLS(userId, async (tx) => {
		// RLS user_books_select_in_group permite ver libros ajenos vía shared_tags
		const rows = await tx
			.select({
				userBookId: userBooks.id,
				bookId: userBooks.bookId,
				title: effectiveTitle,
				authors: effectiveAuthors,
				coverUrl: sql<string | null>`COALESCE(${userBooks.coverUrl}, ${books.coverUrl})`,
				publishYear: sql<number | null>`COALESCE(${userBooks.publishYear}, ${books.publishYear})`,
				isAvailable: userBooks.isAvailable,
				ownerId: userBooks.userId
			})
			.from(userBooks)
			.leftJoin(books, eq(userBooks.bookId, books.id))
			.where(eq(userBooks.id, userBookId));

		if (rows.length === 0) return null;
		const row = rows[0];
		if (row.ownerId === userId) return null; // No se puede pedir el propio libro

		const ownerRows = await db
			.select({ name: user.name })
			.from(user)
			.where(eq(user.id, row.ownerId));

		// Préstamo activo del usuario para este libro (borrower = userId)
		const existingRows = await tx
			.select({ id: loans.id, status: loans.status })
			.from(loans)
			.where(
				and(
					eq(loans.userBookId, userBookId),
					eq(loans.borrowerId, userId),
					inArray(loans.status, ['requested', 'accepted', 'active', 'return_requested'])
				)
			);

		return {
			...row,
			authors: row.authors ?? [],
			ownerName: ownerRows[0]?.name ?? '?',
			existingLoanId: existingRows[0]?.id ?? null,
			existingLoanStatus: (existingRows[0]?.status as LoanStatus) ?? null
		};
	});
}

// ─── Película ajena: ¿se puede pedir? ─────────────────────────────────────────
// Lo que necesita la ficha de una película que no es tuya para ofrecer
// «Pedir prestada»: si está disponible y si ya tienes una petición abierta.

export type BorrowableMovie = {
	userMovieId: string;
	isAvailable: boolean;
	ownerId: string;
	existingLoanId: string | null;
	existingLoanStatus: LoanStatus | null;
};

export async function getMovieForBorrow(
	userId: string,
	userMovieId: string
): Promise<BorrowableMovie | null> {
	return withRLS(userId, async (tx) => {
		const rows = await tx
			.select({ isAvailable: userMovies.isAvailable, ownerId: userMovies.userId })
			.from(userMovies)
			.where(eq(userMovies.id, userMovieId));
		if (rows.length === 0 || rows[0].ownerId === userId) return null;

		const existing = await tx
			.select({ id: loans.id, status: loans.status })
			.from(loans)
			.where(
				and(
					eq(loans.userMovieId, userMovieId),
					eq(loans.borrowerId, userId),
					inArray(loans.status, ['requested', 'accepted', 'active', 'return_requested'])
				)
			);

		return {
			userMovieId,
			...rows[0],
			existingLoanId: existing[0]?.id ?? null,
			existingLoanStatus: (existing[0]?.status as LoanStatus) ?? null
		};
	});
}

// ─── Contar préstamos pendientes de acción ────────────────────────────────────
// Usado para el badge de notificaciones en el nav.

export async function getPendingCount(userId: string): Promise<number> {
	const rows = await withRLS(userId, (tx) =>
		tx
			.select({
				id: loans.id,
				status: loans.status,
				ownerId: loans.ownerId,
				borrowerId: loans.borrowerId
			})
			.from(loans)
			.where(
				or(
					// Como owner: solicitudes recibidas o devoluciones solicitadas
					and(eq(loans.ownerId, userId), inArray(loans.status, ['requested', 'return_requested'])),
					// Como borrower: préstamos aceptados (pendientes de recoger)
					and(eq(loans.borrowerId, userId), eq(loans.status, 'accepted'))
				)
			)
	);

	return rows.length;
}
