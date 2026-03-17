import { nanoid } from 'nanoid';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from './db/index';
import {
	groups,
	groupMembers,
	sharedTags,
	tags,
	userBooks,
	books,
	userBookTags
} from './db/schema';
import { withRLS } from './db/rls';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type GroupRole = 'owner' | 'admin' | 'member';

export type GroupWithRole = {
	id: string;
	name: string;
	description: string | null;
	inviteCode: string | null;
	createdBy: string;
	createdAt: Date;
	role: GroupRole;
	memberCount: number;
};

export type GroupMember = {
	userId: string;
	name: string;
	email: string;
	role: GroupRole;
	joinedAt: Date;
};

export type SharedTagWithBooks = {
	sharedTagId: string;
	tagId: string;
	tagName: string;
	tagColor: string | null;
	ownerName: string;
	ownerId: string;
	bookCount: number;
};

export type GroupBookResult = {
	userBookId: string;
	bookId: string;
	title: string;
	authors: string[];
	coverUrl: string | null;
	publishYear: number | null;
	ownerName: string;
	ownerId: string;
	isAvailable: boolean;
	tags: { id: string; name: string; color: string | null }[];
};

// ─── Crear grupo ──────────────────────────────────────────────────────────────

export async function createGroup(
	userId: string,
	data: { name: string; description?: string }
): Promise<string> {
	const id = nanoid();
	const inviteCode = nanoid(8).toUpperCase();

	// Insertar el grupo con RLS (la política valida que createdBy = currentUser)
	await withRLS(userId, (tx) =>
		tx.insert(groups).values({
			id,
			name: data.name,
			description: data.description ?? null,
			inviteCode,
			createdBy: userId
		})
	);

	// Añadir al creador como owner sin RLS: en el momento de insertar el primer
	// miembro todavía no hay ningún admin en el grupo, así que la política
	// group_members_insert (que requiere ser admin preexistente) bloquearía
	// esta operación si se hiciera con app_user. El superuser bypasea RLS.
	await db.insert(groupMembers).values({
		groupId: id,
		userId,
		role: 'owner'
	});

	return id;
}

// ─── Listar grupos del usuario ────────────────────────────────────────────────

export async function getUserGroups(userId: string): Promise<GroupWithRole[]> {
	// Importar user desde auth schema para el join
	const { user } = await import('./db/schema');

	return withRLS(userId, async (tx) => {
		// Obtener membresías del usuario
		const memberships = await tx
			.select({
				groupId: groupMembers.groupId,
				role: groupMembers.role
			})
			.from(groupMembers)
			.where(eq(groupMembers.userId, userId));

		if (memberships.length === 0) return [];

		const groupIds = memberships.map((m) => m.groupId);
		const roleMap = new Map(memberships.map((m) => [m.groupId, m.role]));

		// Obtener los grupos
		const groupRows = await tx.select().from(groups).where(inArray(groups.id, groupIds));

		// Contar miembros por grupo (sin RLS para conteo global)
		const memberCounts = await db
			.select({ groupId: groupMembers.groupId })
			.from(groupMembers)
			.where(inArray(groupMembers.groupId, groupIds));

		const countMap = new Map<string, number>();
		for (const m of memberCounts) {
			countMap.set(m.groupId, (countMap.get(m.groupId) ?? 0) + 1);
		}

		return groupRows.map((g) => ({
			...g,
			role: roleMap.get(g.id) as GroupRole,
			memberCount: countMap.get(g.id) ?? 0
		}));
	});
}

// ─── Obtener grupo por ID ─────────────────────────────────────────────────────

export async function getGroup(userId: string, groupId: string): Promise<GroupWithRole | null> {
	return withRLS(userId, async (tx) => {
		const rows = await tx.select().from(groups).where(eq(groups.id, groupId));

		if (rows.length === 0) return null;

		const membership = await tx
			.select({ role: groupMembers.role })
			.from(groupMembers)
			.where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));

		if (membership.length === 0) return null;

		const memberCount = await db
			.select({ userId: groupMembers.userId })
			.from(groupMembers)
			.where(eq(groupMembers.groupId, groupId));

		return {
			...rows[0],
			role: membership[0].role as GroupRole,
			memberCount: memberCount.length
		};
	});
}

// ─── Listar miembros de un grupo ──────────────────────────────────────────────

export async function getGroupMembers(userId: string, groupId: string): Promise<GroupMember[]> {
	const { user } = await import('./db/schema');

	return withRLS(userId, async (tx) => {
		const rows = await tx
			.select({
				userId: groupMembers.userId,
				role: groupMembers.role,
				joinedAt: groupMembers.joinedAt,
				name: user.name,
				email: user.email
			})
			.from(groupMembers)
			.innerJoin(user, eq(groupMembers.userId, user.id))
			.where(eq(groupMembers.groupId, groupId));

		return rows.map((r) => ({
			...r,
			role: r.role as GroupRole
		}));
	});
}

// ─── Unirse a grupo por código de invitación ──────────────────────────────────

export async function joinGroupByCode(
	userId: string,
	inviteCode: string
): Promise<{ success: boolean; groupId?: string; error?: string }> {
	// Buscar el grupo por código (sin RLS — el grupo puede no ser visible aún)
	const groupRows = await db
		.select({ id: groups.id, name: groups.name })
		.from(groups)
		.where(eq(groups.inviteCode, inviteCode.toUpperCase().trim()));

	if (groupRows.length === 0) {
		return { success: false, error: 'Código de invitación no válido' };
	}

	const group = groupRows[0];

	// Comprobar si ya es miembro
	const existing = await db
		.select({ userId: groupMembers.userId })
		.from(groupMembers)
		.where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userId, userId)));

	if (existing.length > 0) {
		return { success: false, groupId: group.id, error: 'Ya eres miembro de este grupo' };
	}

	await withRLS(userId, (tx) =>
		tx.insert(groupMembers).values({ groupId: group.id, userId, role: 'member' })
	);

	return { success: true, groupId: group.id };
}

// ─── Expulsar / salir de un grupo ────────────────────────────────────────────

export async function leaveGroup(userId: string, groupId: string): Promise<void> {
	await withRLS(userId, (tx) =>
		tx
			.delete(groupMembers)
			.where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
	);
}

export async function removeMember(
	actorId: string,
	groupId: string,
	targetUserId: string
): Promise<void> {
	await withRLS(actorId, (tx) =>
		tx
			.delete(groupMembers)
			.where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId)))
	);
}

// ─── Regenerar código de invitación ──────────────────────────────────────────

export async function regenerateInviteCode(userId: string, groupId: string): Promise<string> {
	const newCode = nanoid(8).toUpperCase();
	await withRLS(userId, (tx) =>
		tx
			.update(groups)
			.set({ inviteCode: newCode, updatedAt: new Date() })
			.where(eq(groups.id, groupId))
	);
	return newCode;
}

// ─── Compartir etiqueta con un grupo ─────────────────────────────────────────

export async function shareTagWithGroup(
	userId: string,
	tagId: string,
	groupId: string
): Promise<void> {
	const id = nanoid();
	await withRLS(userId, (tx) =>
		tx.insert(sharedTags).values({ id, tagId, groupId, sharedBy: userId }).onConflictDoNothing()
	);
}

// ─── Dejar de compartir etiqueta ─────────────────────────────────────────────

export async function unshareTag(userId: string, tagId: string, groupId: string): Promise<void> {
	await withRLS(userId, (tx) =>
		tx.delete(sharedTags).where(and(eq(sharedTags.tagId, tagId), eq(sharedTags.groupId, groupId)))
	);
}

// ─── Etiquetas compartidas en un grupo ───────────────────────────────────────

export async function getSharedTagsInGroup(
	userId: string,
	groupId: string
): Promise<SharedTagWithBooks[]> {
	const { user } = await import('./db/schema');

	return withRLS(userId, async (tx) => {
		const rows = await tx
			.select({
				sharedTagId: sharedTags.id,
				tagId: tags.id,
				tagName: tags.name,
				tagColor: tags.color,
				ownerId: sharedTags.sharedBy,
				ownerName: user.name
			})
			.from(sharedTags)
			.innerJoin(tags, eq(sharedTags.tagId, tags.id))
			.innerJoin(user, eq(sharedTags.sharedBy, user.id))
			.where(eq(sharedTags.groupId, groupId));

		// Contar libros por etiqueta compartida
		const result: SharedTagWithBooks[] = [];
		for (const row of rows) {
			const bookCount = await db
				.select({ id: userBookTags.userBookId })
				.from(userBookTags)
				.where(eq(userBookTags.tagId, row.tagId));

			result.push({ ...row, bookCount: bookCount.length });
		}
		return result;
	});
}

// ─── Etiquetas propias del usuario que puede compartir en un grupo ────────────

export async function getUserTagsForGroup(
	userId: string,
	groupId: string
): Promise<{ id: string; name: string; color: string | null; alreadyShared: boolean }[]> {
	return withRLS(userId, async (tx) => {
		const userTagRows = await tx
			.select({ id: tags.id, name: tags.name, color: tags.color })
			.from(tags)
			.where(eq(tags.userId, userId));

		const sharedRows = await tx
			.select({ tagId: sharedTags.tagId })
			.from(sharedTags)
			.where(and(eq(sharedTags.groupId, groupId), eq(sharedTags.sharedBy, userId)));

		const sharedSet = new Set(sharedRows.map((r) => r.tagId));

		return userTagRows.map((t) => ({
			...t,
			alreadyShared: sharedSet.has(t.id)
		}));
	});
}

// ─── Buscar libros en un grupo ────────────────────────────────────────────────
// Devuelve todos los libros accesibles a través de etiquetas compartidas en el grupo.
// Opcionalmente filtra por query de texto o por tagId.

export async function searchBooksInGroup(
	userId: string,
	groupId: string,
	opts: { query?: string; tagId?: string } = {}
): Promise<GroupBookResult[]> {
	const { user } = await import('./db/schema');

	return withRLS(userId, async (tx) => {
		// 1. Obtener las etiquetas compartidas en el grupo
		const sharedTagRows = await tx
			.select({ tagId: sharedTags.tagId })
			.from(sharedTags)
			.where(eq(sharedTags.groupId, groupId));

		if (sharedTagRows.length === 0) return [];

		const tagIds = opts.tagId ? [opts.tagId] : sharedTagRows.map((r) => r.tagId);

		// 2. Obtener user_books que tienen alguna de esas etiquetas
		const ubRows = await db
			.select({
				userBookId: userBookTags.userBookId,
				tagId: userBookTags.tagId
			})
			.from(userBookTags)
			.where(inArray(userBookTags.tagId, tagIds));

		if (ubRows.length === 0) return [];

		const userBookIds = [...new Set(ubRows.map((r) => r.userBookId))];

		// 3. Obtener detalles de esos user_books con su libro y propietario
		const detailRows = await db
			.select({
				userBookId: userBooks.id,
				bookId: books.id,
				title: books.title,
				authors: books.authors,
				coverUrl: books.coverUrl,
				publishYear: books.publishYear,
				isAvailable: userBooks.isAvailable,
				ownerId: userBooks.userId,
				ownerName: user.name
			})
			.from(userBooks)
			.innerJoin(books, eq(userBooks.bookId, books.id))
			.innerJoin(user, eq(userBooks.userId, user.id))
			.where(inArray(userBooks.id, userBookIds));

		// 4. Filtrar por query de texto si se indica
		let filtered = detailRows;
		if (opts.query) {
			const q = opts.query.toLowerCase();
			filtered = detailRows.filter(
				(r) =>
					r.title.toLowerCase().includes(q) ||
					(r.authors ?? []).some((a) => a.toLowerCase().includes(q)) ||
					r.ownerName.toLowerCase().includes(q)
			);
		}

		// 5. Obtener etiquetas de cada libro (solo las compartidas en este grupo)
		const sharedTagIdSet = new Set(sharedTagRows.map((r) => r.tagId));
		const result: GroupBookResult[] = [];

		for (const row of filtered) {
			const bookTagRows = await db
				.select({ id: tags.id, name: tags.name, color: tags.color })
				.from(userBookTags)
				.innerJoin(tags, eq(userBookTags.tagId, tags.id))
				.where(
					and(
						eq(userBookTags.userBookId, row.userBookId),
						inArray(userBookTags.tagId, [...sharedTagIdSet])
					)
				);

			result.push({
				...row,
				authors: row.authors ?? [],
				tags: bookTagRows
			});
		}

		return result;
	});
}
