import { nanoid } from 'nanoid';
import { eq, and, or, inArray } from 'drizzle-orm';
import { db } from './db/index';
import { loans, userBooks, books } from './db/schema';
import { withRLS } from './db/rls';

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
	// Libro
	userBookId: string;
	bookId: string;
	title: string;
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

export async function requestLoan(
	borrowerId: string,
	userBookId: string,
	notes?: string
): Promise<string> {
	// Obtener el propietario del libro sin RLS (lectura pública de userBooks necesaria)
	const ubRows = await db
		.select({ userId: userBooks.userId, isAvailable: userBooks.isAvailable })
		.from(userBooks)
		.where(eq(userBooks.id, userBookId));

	if (ubRows.length === 0) throw new Error('Libro no encontrado');
	const { userId: ownerId, isAvailable } = ubRows[0];

	if (!isAvailable) throw new Error('El libro no está disponible');
	if (ownerId === borrowerId) throw new Error('No puedes solicitar tu propio libro');

	// Comprobar que no hay ya un préstamo activo o pendiente para este libro
	const existing = await db
		.select({ id: loans.id })
		.from(loans)
		.where(
			and(
				eq(loans.userBookId, userBookId),
				inArray(loans.status, ['requested', 'accepted', 'active'])
			)
		);
	if (existing.length > 0) throw new Error('Ya existe una solicitud activa para este libro');

	const id = nanoid();

	// El INSERT con RLS requiere borrower_id = current_user
	await withRLS(borrowerId, (tx) =>
		tx.insert(loans).values({
			id,
			userBookId,
			borrowerId,
			ownerId,
			status: 'requested',
			notes: notes ?? null
		})
	);

	return id;
}

// ─── Listar préstamos del usuario ─────────────────────────────────────────────

export async function getUserLoans(userId: string): Promise<{
	asOwner: LoanWithDetails[];
	asBorrower: LoanWithDetails[];
}> {
	const { user } = await import('./db/schema');

	const rows = await withRLS(userId, async (tx) => {
		const borrower = user; // alias para claridad

		// Drizzle no soporta bien self-joins, usamos db directamente con alias via SQL
		// Hacemos dos queries separadas y las combinamos
		const ownerLoans = await db
			.select({
				id: loans.id,
				status: loans.status,
				requestedAt: loans.requestedAt,
				acceptedAt: loans.acceptedAt,
				activeAt: loans.activeAt,
				returnRequestedAt: loans.returnRequestedAt,
				returnedAt: loans.returnedAt,
				dueDate: loans.dueDate,
				notes: loans.notes,
				userBookId: loans.userBookId,
				bookId: books.id,
				title: books.title,
				authors: books.authors,
				coverUrl: books.coverUrl,
				borrowerId: loans.borrowerId,
				ownerId: loans.ownerId
			})
			.from(loans)
			.innerJoin(userBooks, eq(loans.userBookId, userBooks.id))
			.innerJoin(books, eq(userBooks.bookId, books.id))
			.where(eq(loans.ownerId, userId));

		const borrowerLoans = await db
			.select({
				id: loans.id,
				status: loans.status,
				requestedAt: loans.requestedAt,
				acceptedAt: loans.acceptedAt,
				activeAt: loans.activeAt,
				returnRequestedAt: loans.returnRequestedAt,
				returnedAt: loans.returnedAt,
				dueDate: loans.dueDate,
				notes: loans.notes,
				userBookId: loans.userBookId,
				bookId: books.id,
				title: books.title,
				authors: books.authors,
				coverUrl: books.coverUrl,
				borrowerId: loans.borrowerId,
				ownerId: loans.ownerId
			})
			.from(loans)
			.innerJoin(userBooks, eq(loans.userBookId, userBooks.id))
			.innerJoin(books, eq(userBooks.bookId, books.id))
			.where(eq(loans.borrowerId, userId));

		return { ownerLoans, borrowerLoans };
	});

	// Resolver nombres de usuarios implicados
	const { user: userTable } = await import('./db/schema');
	const allUserIds = [
		...new Set([
			...rows.ownerLoans.map((r) => r.borrowerId),
			...rows.borrowerLoans.map((r) => r.ownerId)
		])
	];

	const userRows =
		allUserIds.length > 0
			? await db
					.select({ id: userTable.id, name: userTable.name, email: userTable.email })
					.from(userTable)
					.where(inArray(userTable.id, allUserIds))
			: [];

	const userMap = new Map(userRows.map((u) => [u.id, u]));

	// Datos del propio usuario
	const selfRows = await db
		.select({ id: userTable.id, name: userTable.name, email: userTable.email })
		.from(userTable)
		.where(eq(userTable.id, userId));
	const self = selfRows[0] ?? { id: userId, name: 'Tú', email: '' };

	function enrich(row: (typeof rows.ownerLoans)[0], asOwner: boolean): LoanWithDetails {
		const borrowerInfo = asOwner ? (userMap.get(row.borrowerId) ?? { name: '?', email: '' }) : self;
		const ownerInfo = asOwner ? self : (userMap.get(row.ownerId) ?? { name: '?', email: '' });
		return {
			...row,
			status: row.status as LoanStatus,
			authors: row.authors ?? [],
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
	const { user: userTable } = await import('./db/schema');

	const rows = await withRLS(userId, (tx) =>
		db
			.select({
				id: loans.id,
				status: loans.status,
				requestedAt: loans.requestedAt,
				acceptedAt: loans.acceptedAt,
				activeAt: loans.activeAt,
				returnRequestedAt: loans.returnRequestedAt,
				returnedAt: loans.returnedAt,
				dueDate: loans.dueDate,
				notes: loans.notes,
				userBookId: loans.userBookId,
				bookId: books.id,
				title: books.title,
				authors: books.authors,
				coverUrl: books.coverUrl,
				borrowerId: loans.borrowerId,
				ownerId: loans.ownerId
			})
			.from(loans)
			.innerJoin(userBooks, eq(loans.userBookId, userBooks.id))
			.innerJoin(books, eq(userBooks.bookId, books.id))
			.where(eq(loans.id, loanId))
	);

	if (rows.length === 0) return null;
	const row = rows[0];

	const involvedIds = [...new Set([row.borrowerId, row.ownerId])];
	const userRows = await db
		.select({ id: userTable.id, name: userTable.name, email: userTable.email })
		.from(userTable)
		.where(inArray(userTable.id, involvedIds));

	const userMap = new Map(userRows.map((u) => [u.id, u]));
	const borrower = userMap.get(row.borrowerId) ?? { name: '?', email: '' };
	const owner = userMap.get(row.ownerId) ?? { name: '?', email: '' };

	return {
		...row,
		status: row.status as LoanStatus,
		authors: row.authors ?? [],
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
	toStatus: LoanStatus
): Promise<{ success: boolean; error?: string }> {
	const loan = await getLoan(userId, loanId);
	if (!loan) return { success: false, error: 'Préstamo no encontrado' };

	const isOwner = loan.ownerId === userId;
	const isBorrower = loan.borrowerId === userId;
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

	await withRLS(userId, (tx) =>
		tx
			.update(loans)
			.set({ status: toStatus, ...extraFields })
			.where(eq(loans.id, loanId))
	);

	// Si el préstamo se activa, marcar el libro como no disponible
	if (toStatus === 'active') {
		await db
			.update(userBooks)
			.set({ isAvailable: false, updatedAt: new Date() })
			.where(eq(userBooks.id, loan.userBookId));
	}

	// Si se devuelve, cancelar o rechazar → libro disponible de nuevo
	if (['returned', 'rejected', 'cancelled'].includes(toStatus)) {
		await db
			.update(userBooks)
			.set({ isAvailable: true, updatedAt: new Date() })
			.where(eq(userBooks.id, loan.userBookId));
	}

	return { success: true };
}

// ─── Contar préstamos pendientes de acción ────────────────────────────────────
// Usado para el badge de notificaciones en el nav.

export async function getPendingCount(userId: string): Promise<number> {
	const rows = await withRLS(userId, (tx) =>
		db
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
