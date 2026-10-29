import { randomBytes, randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { invitations, user } from './db/schema';
import { EMAIL, invitationExpiry, invitationStatus, type InvitationStatus } from '../invitation';

// Cualquier Drizzle de Postgres: el de la app (postgres-js), el de los tests
// (PGlite) o el de scripts/invitar.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<PgQueryResultHKT, any>;

/**
 * Las invitaciones (schema.ts, `invitations`): se crean, se leen por el token de
 * su enlace y se aceptan al crear la cuenta. Sin `$env` ni `$app`, para usarlo
 * desde scripts y probarlo en PGlite; la app usa invitations.ts.
 */

export const newToken = () => randomBytes(32).toString('base64url');

const sameEmail = (column: typeof invitations.email | typeof user.email, email: string) =>
	eq(sql`lower(${column})`, email.trim().toLowerCase());

/** Ni aceptada ni cancelada: quizá caducada. */
const open = and(isNull(invitations.usedAt), isNull(invitations.cancelledAt));

export type Invited = { ok: true; id: string; token: string } | { ok: false; problem: string };

export interface FoundInvitation {
	email: string;
	status: InvitationStatus;
	expiresAt: Date;
	inviterName: string | null;
	/** Si ese email ya tiene cuenta: entonces se entra, no se registra. */
	hasAccount: boolean;
}

export interface SentInvitation {
	id: string;
	email: string;
	token: string;
	status: InvitationStatus;
	createdAt: Date;
	expiresAt: Date;
}

export function invitationStore(db: AnyDb) {
	return {
		/**
		 * Una invitación para este email, con un enlace nuevo que dura 7 días. Si ya
		 * tenía una abierta, se renueva (token nuevo: el enlace viejo deja de valer) y
		 * pasa a ser de quien invita ahora. A quien ya tiene cuenta no se le invita.
		 */
		invite(email: string, invitedBy: string | null): Promise<Invited> {
			const clean = email.trim();
			if (!EMAIL.test(clean))
				return Promise.resolve({ ok: false, problem: 'Ese email no parece válido' });
			return db.transaction(async (tx) => {
				const [account] = await tx
					.select({ id: user.id })
					.from(user)
					.where(sameEmail(user.email, clean));
				if (account) return { ok: false, problem: 'Esa persona ya está en Librarian' };
				const token = newToken();
				const [already] = await tx
					.select({ id: invitations.id })
					.from(invitations)
					.where(and(sameEmail(invitations.email, clean), open))
					.for('update');
				if (already) {
					await tx
						.update(invitations)
						.set({ token, invitedBy, expiresAt: invitationExpiry() })
						.where(eq(invitations.id, already.id));
					return { ok: true, id: already.id, token };
				}
				const id = randomUUID();
				await tx
					.insert(invitations)
					.values({ id, email: clean, token, invitedBy, expiresAt: invitationExpiry() });
				return { ok: true, id, token };
			});
		},

		/** Lo que invita el enlace, para su página; null si no hay tal enlace. */
		async byToken(token: string): Promise<FoundInvitation | null> {
			const [found] = await db
				.select({
					email: invitations.email,
					expiresAt: invitations.expiresAt,
					usedAt: invitations.usedAt,
					cancelledAt: invitations.cancelledAt,
					inviterName: user.name
				})
				.from(invitations)
				.leftJoin(user, eq(user.id, invitations.invitedBy))
				.where(eq(invitations.token, token));
			if (!found) return null;
			const [account] = await db
				.select({ id: user.id })
				.from(user)
				.where(sameEmail(user.email, found.email));
			return {
				email: found.email,
				status: invitationStatus(found),
				expiresAt: found.expiresAt,
				inviterName: found.inviterName,
				hasAccount: Boolean(account)
			};
		},

		/**
		 * La invitación usada por la cuenta recién creada con su email. Como el enlace
		 * llegó a ese correo, el email queda verificado.
		 */
		async accept(token: string, who: { id: string; email: string }): Promise<boolean> {
			return db.transaction(async (tx) => {
				const [inv] = await tx
					.select()
					.from(invitations)
					.where(eq(invitations.token, token))
					.for('update');
				if (!inv || invitationStatus(inv) !== 'pending') return false;
				if (inv.email.trim().toLowerCase() !== who.email.trim().toLowerCase()) return false;
				await tx.update(invitations).set({ usedAt: new Date() }).where(eq(invitations.id, inv.id));
				await tx.update(user).set({ emailVerified: true }).where(eq(user.id, who.id));
				return true;
			});
		},

		/** Las que ha mandado alguien, las últimas primero. */
		async sentBy(userId: string): Promise<SentInvitation[]> {
			const rows = await db
				.select()
				.from(invitations)
				.where(eq(invitations.invitedBy, userId))
				.orderBy(desc(invitations.createdAt));
			return rows.map((r) => ({
				id: r.id,
				email: r.email,
				token: r.token,
				status: invitationStatus(r),
				createdAt: r.createdAt,
				expiresAt: r.expiresAt
			}));
		},

		/** Cancela una invitación abierta de quien la mandó. */
		async cancel(id: string, userId: string): Promise<boolean> {
			const done = await db
				.update(invitations)
				.set({ cancelledAt: new Date() })
				.where(and(eq(invitations.id, id), eq(invitations.invitedBy, userId), open))
				.returning({ id: invitations.id });
			return done.length > 0;
		},

		/** Si aún no hay ninguna cuenta: la primera, o null si ya hay alguien. */
		async noAccountsYet(): Promise<boolean> {
			const [anyone] = await db.select({ id: user.id }).from(user).limit(1);
			return !anyone;
		}
	};
}

export type InvitationStore = ReturnType<typeof invitationStore>;
