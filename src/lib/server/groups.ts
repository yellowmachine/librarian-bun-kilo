import { nanoid, customAlphabet } from 'nanoid';

const nanoidCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);
import { eq, and, inArray, sql } from 'drizzle-orm';
import { db } from './db/index';
import {
  groups,
  groupMembers,
  groupInviteCodes,
  sharedTags,
  tags,
  userBooks,
  books,
  userBookTags
} from './db/schema';
import { user } from './db/auth.schema';
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

  await withRLS(userId, async (tx) => {
    await tx.insert(groups).values({
      id,
      name: data.name,
      description: data.description ?? null,
      createdBy: userId
    });
    await tx.insert(groupMembers).values({ groupId: id, userId, role: 'owner' });
    // El invite code se inserta después del member para que la policy
    // group_invite_codes_insert (requiere ser owner/admin) lo encuentre.
    await tx.insert(groupInviteCodes).values({ groupId: id, code: nanoidCode() });
  });

  return id;
}

// ─── Listar grupos del usuario ────────────────────────────────────────────────

export async function getUserGroups(userId: string): Promise<GroupWithRole[]> {

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

    // Obtener grupos con su invite code
    const groupRows = await tx
      .select({
        id: groups.id,
        name: groups.name,
        description: groups.description,
        createdBy: groups.createdBy,
        createdAt: groups.createdAt,
        updatedAt: groups.updatedAt,
        inviteCode: groupInviteCodes.code
      })
      .from(groups)
      .leftJoin(groupInviteCodes, eq(groups.id, groupInviteCodes.groupId))
      .where(inArray(groups.id, groupIds));

    // Contar miembros por grupo (dentro del contexto RLS)
    const memberCounts = await tx
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
    const rows = await tx
      .select({
        id: groups.id,
        name: groups.name,
        description: groups.description,
        createdBy: groups.createdBy,
        createdAt: groups.createdAt,
        updatedAt: groups.updatedAt,
        inviteCode: groupInviteCodes.code
      })
      .from(groups)
      .leftJoin(groupInviteCodes, eq(groups.id, groupInviteCodes.groupId))
      .where(eq(groups.id, groupId));

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
  return withRLS(userId, async (tx) => {
    // Uses SECURITY DEFINER function in Scholio — bypasses RLS self-referential recursion
    // on group_members while still validating that userId is a member of the group.
    const rows = await tx.execute<{
      user_id: string;
      role: string;
      joined_at: Date;
      name: string;
      email: string;
    }>(sql`SELECT * FROM librarian.get_group_members(${groupId})`);

    if (rows.length === 0) return [];

    return rows.map((r) => ({
      userId: r.user_id,
      role: r.role as GroupRole,
      joinedAt: r.joined_at,
      name: r.name,
      email: r.email
    }));
  });
}

// ─── Unirse a grupo por código de invitación ──────────────────────────────────

export async function joinGroupByCode(
  userId: string,
  inviteCode: string
): Promise<{ success: boolean; groupId?: string; error?: string }> {
  return withRLS(userId, async (tx) => {
    // group_invite_codes tiene USING(true) — cualquier usuario autenticado puede leer
    const codeRows = await tx
      .select({ groupId: groupInviteCodes.groupId })
      .from(groupInviteCodes)
      .where(eq(groupInviteCodes.code, inviteCode.toUpperCase().trim()));

    if (codeRows.length === 0) {
      return { success: false, error: 'Invitation code not valid' };
    }

    const { groupId } = codeRows[0];

    // group_members_select: user_id = current_user_id — comprueba si ya es miembro
    const existing = await tx
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));

    if (existing.length > 0) {
      return { success: false, groupId, error: 'You are already member of this group.' };
    }

    // group_members_insert_self: user_id = current_user_id — válido para unirse
    await tx.insert(groupMembers).values({ groupId, userId, role: 'member' });

    return { success: true, groupId };
  });
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
  const newCode = nanoidCode();
  await withRLS(userId, (tx) =>
    tx
      .insert(groupInviteCodes)
      .values({ groupId, code: newCode })
      .onConflictDoUpdate({ target: groupInviteCodes.groupId, set: { code: newCode, createdAt: new Date() } })
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
  return withRLS(userId, async (tx) => {
    // tags_select_in_group policy allows seeing tags shared in groups the user belongs to
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

    if (rows.length === 0) return [];

    // user_book_tags_select_in_group policy allows counting books via shared tags
    const tagIds = rows.map((r) => r.tagId);
    const allBookTags = await tx
      .select({ tagId: userBookTags.tagId })
      .from(userBookTags)
      .where(inArray(userBookTags.tagId, tagIds));

    const bookCountMap = new Map<string, number>();
    for (const bt of allBookTags) {
      bookCountMap.set(bt.tagId, (bookCountMap.get(bt.tagId) ?? 0) + 1);
    }

    return rows.map((row) => ({ ...row, bookCount: bookCountMap.get(row.tagId) ?? 0 }));
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

// ─── Buscar libros de otros usuarios (cross-group) ───────────────────────────
// Devuelve libros de otros usuarios visibles a través de shared_tags en
// cualquier grupo al que pertenezca el usuario. Filtra por texto libre
// (título, autores, nombre del propietario, nombre del tag).

export async function searchBooksFromOthers(
  userId: string,
  query: string
): Promise<GroupBookResult[]> {
  if (!query.trim()) return [];
  const q = query.toLowerCase().trim();

  return withRLS(userId, async (tx) => {
    // 1. Grupos del usuario
    const memberRows = await tx
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, userId));

    if (memberRows.length === 0) return [];
    const groupIds = memberRows.map((r) => r.groupId);

    // 2. Tags compartidos en esos grupos
    const sharedTagRows = await tx
      .select({ tagId: sharedTags.tagId })
      .from(sharedTags)
      .where(inArray(sharedTags.groupId, groupIds));

    if (sharedTagRows.length === 0) return [];
    const tagIds = [...new Set(sharedTagRows.map((r) => r.tagId))];

    // 3. user_book_ids que tienen esos tags (RLS permite verlos via in_group policy)
    const ubTagRows = await tx
      .select({ userBookId: userBookTags.userBookId })
      .from(userBookTags)
      .where(inArray(userBookTags.tagId, tagIds));

    if (ubTagRows.length === 0) return [];
    const userBookIds = [...new Set(ubTagRows.map((r) => r.userBookId))];

    // 4. Detalle de los libros, excluyendo los propios
    const detailRows = await tx
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
      .where(
        and(
          inArray(userBooks.id, userBookIds),
          sql`${userBooks.userId} != ${userId}`
        )
      );

    if (detailRows.length === 0) return [];

    // 5. Tags visibles por libro (solo los shared)
    const filteredIds = detailRows.map((r) => r.userBookId);
    const bookTagRows = await tx
      .select({
        userBookId: userBookTags.userBookId,
        id: tags.id,
        name: tags.name,
        color: tags.color
      })
      .from(userBookTags)
      .innerJoin(tags, eq(userBookTags.tagId, tags.id))
      .where(
        and(
          inArray(userBookTags.userBookId, filteredIds),
          inArray(userBookTags.tagId, tagIds)
        )
      );

    const tagsMap = new Map<string, { id: string; name: string; color: string | null }[]>();
    for (const bt of bookTagRows) {
      const list = tagsMap.get(bt.userBookId) ?? [];
      list.push({ id: bt.id, name: bt.name, color: bt.color });
      tagsMap.set(bt.userBookId, list);
    }

    // 6. Filtro de texto en JS (título, autores, propietario, tags)
    return detailRows
      .map((row) => ({
        ...row,
        authors: row.authors ?? [],
        tags: tagsMap.get(row.userBookId) ?? []
      }))
      .filter(
        (book) =>
          book.title.toLowerCase().includes(q) ||
          book.authors.some((a: string) => a.toLowerCase().includes(q)) ||
          book.ownerName.toLowerCase().includes(q) ||
          book.tags.some((t) => t.name.toLowerCase().includes(q))
      );
  });
}

