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
// de los dos lados trae datos y COALESCE se queda con ese.
const itemTitle = sql<string | null>`COALESCE(
	${userBooks.title}, ${books.title}, ${userMovies.title}, ${movies.title}
)`;
const itemCreators = sql<string[] | null>`COALESCE(
	${userBooks.authors}, ${books.authors}, ${userMovies.directors}, ${movies.directors}
)`;
const itemCover = sql<string | null>`COALESCE(
	${userBooks.coverUrl}, ${books.coverUrl}, ${userMovies.coverUrl}, ${movies.posterUrl}
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
	userBookId: loans.userBookId,
	userMovieId: loans.userMovieId,
	bookId: userBooks.bookId,
	movieId: userMovies.movieId,
	title: itemTitle,
	authors: itemCreators,
	coverUrl: itemCover,
	borrowerId: loans.borrowerId,
	ownerId: loans.ownerId
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

// Qué es y dónde está su ficha
function itemFields(row: LoanRow) {
	const isMovie = row.userMovieId !== null;
	return {
		itemKind: (isMovie ? 'movie' : 'book') as 'book' | 'movie',
		itemHref: isMovie ? `/movies/${row.userMovieId}` : `/library/${row.userBookId}`,
		title: row.title ?? '?',
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
	itemHref: string;
	userBookId: string | null;
	userMovieId: string | null;
	bookId: string | null;
	movieId: string | null;
	title: string;
	/** Autores del libro o directores de la película */
	authors: string[];
	coverUrl: string | null;
	// Personas
	borrowerId: string;
	borrowerName: string;
	borrowerEmail: string;
	ownerId: string;
	ownerName: string;
	ownerEmail: string;
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
							title: effectiveTitle
						})
						.from(userBooks)
						.leftJoin(books, eq(userBooks.bookId, books.id))
						.where(eq(userBooks.id, item.userBookId))
				: await tx
						.select({
							ownerId: userMovies.userId,
							isAvailable: userMovies.isAvailable,
							title: sql<string>`COALESCE(${userMovies.title}, ${movies.title})`
						})
						.from(userMovies)
						.leftJoin(movies, eq(userMovies.movieId, movies.id))
						.where(eq(userMovies.id, item.userMovieId));

		const noun = item.kind === 'book' ? 'book' : 'movie';
		if (rows.length === 0)
			throw new Error(item.kind === 'book' ? 'Book not found' : 'Movie not found');
		const { ownerId, isAvailable, title } = rows[0];

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

	// Resolver nombres de usuarios implicados
	const allUserIds = [
		...new Set([
			...rows.ownerLoans.map((r) => r.borrowerId),
			...rows.borrowerLoans.map((r) => r.ownerId)
		])
	];

	const userRows =
		allUserIds.length > 0
			? await db
					.select({ id: user.id, name: user.name, email: user.email })
					.from(user)
					.where(inArray(user.id, allUserIds))
			: [];

	const userMap = new Map(userRows.map((u) => [u.id, u]));

	// Datos del propio usuario
	const selfRows = await db
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.where(eq(user.id, userId));
	const self = selfRows[0] ?? { id: userId, name: 'You', email: '' };

	function enrich(row: (typeof rows.ownerLoans)[0], asOwner: boolean): LoanWithDetails {
		const borrowerInfo = asOwner ? (userMap.get(row.borrowerId) ?? { name: '?', email: '' }) : self;
		const ownerInfo = asOwner ? self : (userMap.get(row.ownerId) ?? { name: '?', email: '' });
		return {
			...row,
			...itemFields(row),
			status: row.status as LoanStatus,
			borrowerName: borrowerInfo.name,
			borrowerEmail: borrowerInfo.email ?? '',
			ownerName: ownerInfo.name,
			ownerEmail: ownerInfo.email ?? ''
		};
	}

	return {
		asOwner: rows.ownerLoans.map((r) => enrich(r, true)),
		asBorrower: rows.borrowerLoans.map((r) => enrich(r, false))
	};
}

// ─── Obtener préstamo por ID ──────────────────────────────────────────────────

export async function getLoan(userId: string, loanId: string): Promise<LoanWithDetails | null> {
	const rows = await withRLS(userId, (tx) => selectLoans(tx).where(eq(loans.id, loanId)));

	if (rows.length === 0) return null;
	const row = rows[0];

	const involvedIds = [...new Set([row.borrowerId, row.ownerId])];
	const userRows = await db
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.where(inArray(user.id, involvedIds));

	const userMap = new Map(userRows.map((u) => [u.id, u]));
	const borrower = userMap.get(row.borrowerId) ?? { name: '?', email: '' };
	const owner = userMap.get(row.ownerId) ?? { name: '?', email: '' };

	return {
		...row,
		...itemFields(row),
		status: row.status as LoanStatus,
		borrowerName: borrower.name,
		borrowerEmail: borrower.email ?? '',
		ownerName: owner.name,
		ownerEmail: owner.email ?? ''
	};
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

	const transition = TRANSITIONS.find(
		(t) => t.to === toStatus && t.from.includes(loan.status) && t.actor === actor
	);

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
	if (toStatus === 'accepted') {
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

/** Préstamos de una copia (libro o película) que aún no han terminado. */
export async function hasOpenLoans(userId: string, item: LoanItem): Promise<boolean> {
	const rows = await withRLS(userId, (tx) =>
		tx
			.select({ id: loans.id })
			.from(loans)
			.where(
				and(
					item.kind === 'book'
						? eq(loans.userBookId, item.userBookId)
						: eq(loans.userMovieId, item.userMovieId),
					inArray(loans.status, ['requested', 'accepted', 'active', 'return_requested'])
				)
			)
	);
	return rows.length > 0;
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
