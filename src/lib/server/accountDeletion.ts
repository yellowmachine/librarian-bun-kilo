import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { db } from './db/index';
import { withRLS } from './db/rls';
import { groups, groupMembers, invitations, loans } from './db/schema';
import { user } from './db/auth.schema';

// Borrar la cuenta (#94). El RGPD (art. 17) no deja negar el borrado, así que
// nunca se bloquea: los préstamos sin entregar se cancelan, los en curso se
// quedan para la otra parte con el nombre de quien se va (lo mínimo para que
// pueda reclamar su libro, art. 17.3.e) y los cerrados, sin ningún dato suyo.
// Todo va como el propio usuario (withRLS): la RLS ya le deja tocar sus
// préstamos y sus grupos; pasar un grupo a otro lo hace hand_over_group (0014).

/** Sin entregar: nadie tiene aún el libro, se cancelan sin más */
const UNDELIVERED = ['requested', 'accepted'] as const;
/** En curso: alguien tiene el libro */
const IN_PROGRESS = ['active', 'return_requested'] as const;
/** Cuánto vale una sesión para borrar la cuenta sin volver a entrar */
export const RECENT_SESSION_MS = 15 * 60 * 1000;

export type InProgressLoan = {
	id: string;
	title: string;
	/** Quien tiene el libro de quien se va, o a quien se lo tiene */
	otherName: string;
	/** Si quien se va es el dueño (prestó él) */
	asOwner: boolean;
};

export type GroupFate = {
	id: string;
	name: string;
	/** A quién pasa; null si no queda nadie y se borra */
	heirName: string | null;
};

export type DeletionPreview = {
	inProgressLoans: InProgressLoan[];
	groups: GroupFate[];
};

type Tx = Pick<typeof db, 'select' | 'update' | 'delete' | 'execute'>;

// Quien hereda un grupo: el admin más antiguo, o si no hay, el miembro más antiguo.
async function heirOf(tx: Tx, groupId: string, leaving: string) {
	const [heir] = await tx
		.select({ userId: groupMembers.userId, name: user.name })
		.from(groupMembers)
		.innerJoin(user, eq(user.id, groupMembers.userId))
		.where(and(eq(groupMembers.groupId, groupId), ne(groupMembers.userId, leaving)))
		.orderBy(desc(sql`${groupMembers.role} = 'admin'`), asc(groupMembers.joinedAt))
		.limit(1);
	return heir ?? null;
}

async function createdGroups(tx: Tx, userId: string) {
	return tx
		.select({ id: groups.id, name: groups.name })
		.from(groups)
		.where(eq(groups.createdBy, userId))
		.orderBy(asc(groups.name));
}

/** Lo que pasará al borrar: para enseñarlo antes de confirmar */
export async function getDeletionPreview(userId: string): Promise<DeletionPreview> {
	return withRLS(userId, (tx) => preview(tx, userId));
}

async function preview(tx: Tx, userId: string): Promise<DeletionPreview> {
	const loanRows = await tx
		.select({
			id: loans.id,
			title: loans.itemTitle,
			ownerId: loans.ownerId,
			ownerName: sql<string | null>`(select name from "user" where id = ${loans.ownerId})`,
			borrowerName: sql<string | null>`(select name from "user" where id = ${loans.borrowerId})`,
			storedOwnerName: loans.ownerName,
			storedBorrowerName: loans.borrowerName
		})
		.from(loans)
		.where(
			and(
				or(eq(loans.ownerId, userId), eq(loans.borrowerId, userId)),
				inArray(loans.status, [...IN_PROGRESS])
			)
		)
		.orderBy(asc(loans.requestedAt));

	const inProgressLoans = loanRows.map((l) => {
		const asOwner = l.ownerId === userId;
		const other = asOwner
			? (l.borrowerName ?? l.storedBorrowerName)
			: (l.ownerName ?? l.storedOwnerName);
		return { id: l.id, title: l.title, otherName: other ?? '?', asOwner };
	});

	const fates: GroupFate[] = [];
	for (const g of await createdGroups(tx, userId)) {
		const heir = await heirOf(tx, g.id, userId);
		fates.push({ ...g, heirName: heir?.name ?? null });
	}

	return { inProgressLoans, groups: fates };
}

/** Si la sesión empezó hace poco: borrar la cuenta pide haber entrado hace menos de 15 min */
export function isRecentSession(sessionCreatedAt: Date, now = Date.now()): boolean {
	return now - new Date(sessionCreatedAt).getTime() < RECENT_SESSION_MS;
}

/** Borra la cuenta y todo lo suyo, en una transacción. Nunca se bloquea por préstamos. */
export async function deleteAccount(userId: string): Promise<void> {
	await withRLS(userId, async (tx) => {
		const [me] = await tx.select({ name: user.name }).from(user).where(eq(user.id, userId));
		if (!me) throw new Error('Account not found');
		const mine = (col: typeof loans.ownerId | typeof loans.borrowerId) => eq(col, userId);

		// 1. Sin entregar: se cancelan (la disponibilidad no cambia: solo «active» la quita)
		await tx
			.update(loans)
			.set({ status: 'cancelled' })
			.where(
				and(
					or(mine(loans.ownerId), mine(loans.borrowerId)),
					inArray(loans.status, [...UNDELIVERED])
				)
			);

		// 2. En curso: su nombre, para que el otro sepa quién tiene (o de quién es) el libro.
		//    En todos los demás (cerrados), ningún dato suyo.
		const inProgress = inArray(loans.status, [...IN_PROGRESS]);
		await tx
			.update(loans)
			.set({ ownerName: sql`case when ${inProgress} then ${me.name} else null end` })
			.where(mine(loans.ownerId));
		await tx
			.update(loans)
			.set({ borrowerName: sql`case when ${inProgress} then ${me.name} else null end` })
			.where(mine(loans.borrowerId));

		// 3. Grupos que creó: a otro miembro, o fuera si no queda nadie
		for (const g of await createdGroups(tx, userId)) {
			const heir = await heirOf(tx, g.id, userId);
			if (!heir) {
				await tx.delete(groups).where(eq(groups.id, g.id));
				continue;
			}
			await tx.execute(sql`select hand_over_group(${g.id}, ${heir.userId})`);
		}

		// 4. Sus invitaciones abiertas, anuladas (invited_by queda a null al borrar)
		await tx
			.update(invitations)
			.set({ cancelledAt: new Date() })
			.where(
				and(
					eq(invitations.invitedBy, userId),
					isNull(invitations.usedAt),
					isNull(invitations.cancelledAt)
				)
			);

		// 5. La cuenta: el resto cae en cascada; los préstamos quedan con su id a null
		await tx.delete(user).where(eq(user.id, userId));
	});
}
