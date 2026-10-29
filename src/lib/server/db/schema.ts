import { relations, sql } from 'drizzle-orm';
import {
	pgTable,
	pgEnum,
	pgPolicy,
	pgRole,
	text,
	timestamp,
	boolean,
	integer,
	uniqueIndex,
	index,
	check
} from 'drizzle-orm/pg-core';

// ─── Schema ───────────────────────────────────────────────────────────────────
// Todo vive en 'public': las tablas de better-auth (auth.schema.ts, generado con
// `bun run auth:schema`) y las de la aplicación, con sus políticas RLS.
import { user } from './auth.schema';
export * from './auth.schema';

// ─── App role ─────────────────────────────────────────────────────────────────
// Rol con el que se conecta la aplicación (DATABASE_URL). No es dueño de las
// tablas ni superuser, así que las políticas RLS se le aplican siempre.

// .existing() indica a Drizzle que este rol ya existe (creado por scripts/init.sh)
// y NO debe emitir CREATE ROLE en las migraciones generadas.
export const appUser = pgRole('app_user').existing();

// ─── Enums ────────────────────────────────────────────────────────────────────

export const groupRoleEnum = pgEnum('group_role', ['owner', 'admin', 'member']);

export const loanStatusEnum = pgEnum('loan_status', [
	'requested',
	'accepted',
	'active',
	'return_requested',
	'returned',
	'rejected',
	'cancelled'
]);

// ─── Helper SQL ───────────────────────────────────────────────────────────────
// current_setting('app.current_user_id', true) devuelve '' si no está seteado,
// en lugar de lanzar un error.

const currentUserId = sql`current_setting('app.current_user_id', true)`;
// El código de invitación a un grupo que trae quien se une (joinGroupByCode).
const currentInviteCode = sql`current_setting('app.invite_code', true)`;

// ─── Helper functions (SECURITY DEFINER) ─────────────────────────────────────
// Estas funciones bypasean RLS para evitar recursión infinita cuando las
// políticas de group_members se auto-referencian.
// Se crean vía migración manual (no generadas por Drizzle).
const isGroupMember = (groupId: unknown, userId: unknown) =>
	sql`is_group_member(${groupId}, ${userId})`;
const isGroupAdmin = (groupId: unknown, userId: unknown) =>
	sql`is_group_admin(${groupId}, ${userId})`;
const isGroupCreator = (groupId: unknown, userId: unknown) =>
	sql`is_group_creator(${groupId}, ${userId})`;

// ─── Books ────────────────────────────────────────────────────────────────────

export const books = pgTable(
	'books',
	{
		id: text('id').primaryKey(), // OpenLibrary work ID, ej: "OL45804W"
		isbn: text('isbn'),
		title: text('title').notNull(),
		authors: text('authors').array(),
		coverUrl: text('cover_url'),
		publishYear: integer('publish_year'),
		publisher: text('publisher'),
		language: text('language'),
		description: text('description'),
		// Título en otro idioma (p.ej. castellano), resuelto vía Wikidata al dar
		// de alta el libro — ver src/lib/server/wikidata.ts. Best-effort: null si
		// no se encontró.
		alternateTitle: text('alternate_title'),
		openlibraryData: text('openlibrary_data'), // JSON raw guardado como text
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull()
	},
	(table) => [
		index('books_isbn_idx').on(table.isbn),
		// Catálogo global: lectura y escritura sin restricción de usuario
		pgPolicy('books_select', { for: 'select', to: appUser, using: sql`true` }),
		pgPolicy('books_insert', { for: 'insert', to: appUser, withCheck: sql`true` }),
		pgPolicy('books_update', { for: 'update', to: appUser, using: sql`true` })
	]
);

// ─── Libraries ────────────────────────────────────────────────────────────────
// Un usuario puede tener varias bibliotecas (ej: "Casa", "Oficina"). Cada
// usuario tiene exactamente una biblioteca marcada isDefault — se crea de forma
// perezosa (getOrCreateDefaultLibrary) la primera vez que hace falta.

export const libraries = pgTable(
	'libraries',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		isDefault: boolean('is_default').default(false).notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull()
	},
	(table) => [
		// Como máximo una biblioteca default por usuario (índice parcial)
		uniqueIndex('libraries_user_default_idx')
			.on(table.userId)
			.where(sql`${table.isDefault} = true`),
		index('libraries_user_idx').on(table.userId),
		pgPolicy('libraries_select', {
			for: 'select',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId}`
		}),
		pgPolicy('libraries_insert', {
			for: 'insert',
			to: appUser,
			withCheck: sql`${table.userId} = ${currentUserId}`
		}),
		pgPolicy('libraries_update', {
			for: 'update',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId}`
		}),
		pgPolicy('libraries_delete', {
			for: 'delete',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId} and not ${table.isDefault}`
		})
	]
);

// ─── User Books ───────────────────────────────────────────────────────────────

export const userBooks = pgTable(
	'user_books',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		libraryId: text('library_id')
			.notNull()
			.references(() => libraries.id, { onDelete: 'restrict' }),
		// Nullable: null means the book was entered manually (no OpenLibrary record)
		bookId: text('book_id').references(() => books.id, { onDelete: 'restrict' }),
		// Manual-entry fields — override books.* when bookId is null; ignored when bookId is set
		title: text('title'),
		authors: text('authors').array(),
		isbn: text('isbn'),
		description: text('description'),
		publishYear: integer('publish_year'),
		// Título alternativo anotado a mano (entrada manual); mismo patrón de
		// override que el resto de estos campos.
		alternateTitle: text('alternate_title'),
		// URL pública de portada elegida a mano, normalmente sugerida por la
		// búsqueda de portadas (src/lib/server/coverSearch.ts). Excepción al
		// patrón de arriba: también aplica a libros de catálogo sin portada (o
		// con una que el usuario prefiere cambiar), y tapa books.cover_url.
		coverUrl: text('cover_url'),
		notes: text('notes'),
		isAvailable: boolean('is_available').default(true).notNull(),
		addedAt: timestamp('added_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull()
	},
	(table) => [
		// Un usuario puede tener varias copias físicas del mismo libro de catálogo,
		// así que (userId, bookId) NO es único — cada copia es su propia fila.
		index('user_books_user_idx').on(table.userId),
		index('user_books_book_idx').on(table.bookId),
		index('user_books_library_idx').on(table.libraryId),
		// Either bookId (OpenLibrary) or title (manual entry) must be present
		check(
			'user_books_book_or_title',
			sql`${table.bookId} IS NOT NULL OR ${table.title} IS NOT NULL`
		),
		pgPolicy('user_books_select', {
			for: 'select',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId}`
		}),
		pgPolicy('user_books_select_in_group', {
			for: 'select',
			to: appUser,
			using: sql`exists (
				select 1 from user_book_tags ubt
				join shared_tags st on st.tag_id = ubt.tag_id
				join group_members gm on gm.group_id = st.group_id
				where ubt.user_book_id = ${table.id}
				  and gm.user_id = ${currentUserId}
			)`
		}),
		pgPolicy('user_books_select_on_loan', {
			for: 'select',
			to: appUser,
			using: sql`exists (
				select 1 from loans l
				where l.user_book_id = ${table.id}
				  and l.borrower_id = ${currentUserId}
			)`
		}),
		pgPolicy('user_books_insert', {
			for: 'insert',
			to: appUser,
			withCheck: sql`${table.userId} = ${currentUserId}`
		}),
		pgPolicy('user_books_update', {
			for: 'update',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId}`
		}),
		pgPolicy('user_books_delete', {
			for: 'delete',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId}`
		})
	]
);

// ─── Tags ─────────────────────────────────────────────────────────────────────

export const tags = pgTable(
	'tags',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		color: text('color'),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('tags_user_name_idx').on(table.userId, table.name),
		index('tags_user_idx').on(table.userId),
		pgPolicy('tags_select', {
			for: 'select',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId}`
		}),
		pgPolicy('tags_select_in_group', {
			for: 'select',
			to: appUser,
			using: sql`exists (
				select 1 from shared_tags st
				join group_members gm on gm.group_id = st.group_id
				where st.tag_id = ${table.id}
				  and gm.user_id = ${currentUserId}
			)`
		}),
		pgPolicy('tags_insert', {
			for: 'insert',
			to: appUser,
			withCheck: sql`${table.userId} = ${currentUserId}`
		}),
		pgPolicy('tags_update', {
			for: 'update',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId}`
		}),
		pgPolicy('tags_delete', {
			for: 'delete',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId}`
		})
	]
);

// ─── User Book Tags ───────────────────────────────────────────────────────────

export const userBookTags = pgTable(
	'user_book_tags',
	{
		userBookId: text('user_book_id')
			.notNull()
			.references(() => userBooks.id, { onDelete: 'cascade' }),
		tagId: text('tag_id')
			.notNull()
			.references(() => tags.id, { onDelete: 'cascade' })
	},
	(table) => [
		uniqueIndex('user_book_tags_pk').on(table.userBookId, table.tagId),
		index('user_book_tags_tag_idx').on(table.tagId),
		pgPolicy('user_book_tags_select', {
			for: 'select',
			to: appUser,
			using: sql`exists (
				select 1 from tags t
				where t.id = ${table.tagId}
				  and t.user_id = ${currentUserId}
			)`
		}),
		pgPolicy('user_book_tags_select_in_group', {
			for: 'select',
			to: appUser,
			using: sql`exists (
				select 1 from shared_tags st
				join group_members gm on gm.group_id = st.group_id
				where st.tag_id = ${table.tagId}
				  and gm.user_id = ${currentUserId}
			)`
		}),
		pgPolicy('user_book_tags_insert', {
			for: 'insert',
			to: appUser,
			withCheck: sql`exists (
				select 1 from tags t
				where t.id = ${table.tagId}
				  and t.user_id = ${currentUserId}
			)`
		}),
		pgPolicy('user_book_tags_delete', {
			for: 'delete',
			to: appUser,
			using: sql`exists (
				select 1 from tags t
				where t.id = ${table.tagId}
				  and t.user_id = ${currentUserId}
			)`
		})
	]
);

// ─── Groups ───────────────────────────────────────────────────────────────────

export const groups = pgTable(
	'groups',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		description: text('description'),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id, { onDelete: 'restrict' }),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull()
	},
	(table) => [
		pgPolicy('groups_select', {
			for: 'select',
			to: appUser,
			using: isGroupMember(table.id, currentUserId)
		}),
		pgPolicy('groups_insert', {
			for: 'insert',
			to: appUser,
			withCheck: sql`${table.createdBy} = ${currentUserId}`
		}),
		pgPolicy('groups_update', {
			for: 'update',
			to: appUser,
			using: isGroupAdmin(table.id, currentUserId)
		}),
		pgPolicy('groups_delete', {
			for: 'delete',
			to: appUser,
			using: isGroupAdmin(table.id, currentUserId)
		})
	]
);

// ─── Group Members ────────────────────────────────────────────────────────────

export const groupMembers = pgTable(
	'group_members',
	{
		groupId: text('group_id')
			.notNull()
			.references(() => groups.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: groupRoleEnum('role').default('member').notNull(),
		joinedAt: timestamp('joined_at').defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('group_members_pk').on(table.groupId, table.userId),
		index('group_members_user_idx').on(table.userId),
		pgPolicy('group_members_select', {
			for: 'select',
			to: appUser,
			// Un usuario puede ver su propia fila O las de cualquier miembro de su grupo.
			// Usa SECURITY DEFINER para evitar recursión auto-referencial.
			using: sql`${table.userId} = ${currentUserId} or ${isGroupMember(table.groupId, currentUserId)}`
		}),
		// Owner/admin añaden a otros. Uno mismo entra como owner del grupo que
		// acaba de crear (createGroup), o como member con el código de invitación
		// del grupo en app.invite_code (joinGroupByCode).
		pgPolicy('group_members_insert', {
			for: 'insert',
			to: appUser,
			withCheck: sql`${isGroupAdmin(table.groupId, currentUserId)}
				or (${table.userId} = ${currentUserId} and (
					(${table.role} = 'member' and exists (
						select 1 from group_invite_codes c
						where c.group_id = ${table.groupId} and c.code = ${currentInviteCode}
					))
					or (${table.role} = 'owner' and ${isGroupCreator(table.groupId, currentUserId)})
				))`
		}),
		pgPolicy('group_members_delete', {
			for: 'delete',
			to: appUser,
			// Un miembro puede salir (su propia fila) o un owner/admin puede expulsar a otros.
			using: sql`${table.userId} = ${currentUserId} or ${isGroupAdmin(table.groupId, currentUserId)}`
		})
	]
);

// ─── Group Invite Codes ───────────────────────────────────────────────────────
// Tabla separada para los códigos de invitación de grupos. Los ven los miembros
// del grupo, y quien trae ese mismo código (app.invite_code, joinGroupByCode);
// nadie puede listarlos todos. Escritura restringida a owner/admin del grupo.

export const groupInviteCodes = pgTable(
	'group_invite_codes',
	{
		groupId: text('group_id')
			.primaryKey()
			.references(() => groups.id, { onDelete: 'cascade' }),
		code: text('code').notNull().unique(),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		pgPolicy('group_invite_codes_select', {
			for: 'select',
			to: appUser,
			using: sql`${isGroupMember(table.groupId, currentUserId)} or ${table.code} = ${currentInviteCode}`
		}),
		pgPolicy('group_invite_codes_insert', {
			for: 'insert',
			to: appUser,
			withCheck: isGroupAdmin(table.groupId, currentUserId)
		}),
		pgPolicy('group_invite_codes_update', {
			for: 'update',
			to: appUser,
			using: isGroupAdmin(table.groupId, currentUserId)
		}),
		pgPolicy('group_invite_codes_delete', {
			for: 'delete',
			to: appUser,
			using: isGroupAdmin(table.groupId, currentUserId)
		})
	]
);

// ─── Shared Tags ──────────────────────────────────────────────────────────────

export const sharedTags = pgTable(
	'shared_tags',
	{
		id: text('id').primaryKey(),
		tagId: text('tag_id')
			.notNull()
			.references(() => tags.id, { onDelete: 'cascade' }),
		groupId: text('group_id')
			.notNull()
			.references(() => groups.id, { onDelete: 'cascade' }),
		sharedBy: text('shared_by')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		sharedAt: timestamp('shared_at').defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('shared_tags_tag_group_idx').on(table.tagId, table.groupId),
		index('shared_tags_group_idx').on(table.groupId),
		pgPolicy('shared_tags_select', {
			for: 'select',
			to: appUser,
			using: isGroupMember(table.groupId, currentUserId)
		}),
		pgPolicy('shared_tags_insert', {
			for: 'insert',
			to: appUser,
			withCheck: sql`${table.sharedBy} = ${currentUserId} and ${isGroupMember(table.groupId, currentUserId)}`
		}),
		pgPolicy('shared_tags_delete', {
			for: 'delete',
			to: appUser,
			using: sql`${table.sharedBy} = ${currentUserId} or ${isGroupAdmin(table.groupId, currentUserId)}`
		})
	]
);

// ─── Loans ────────────────────────────────────────────────────────────────────

export const loans = pgTable(
	'loans',
	{
		id: text('id').primaryKey(),
		userBookId: text('user_book_id')
			.notNull()
			.references(() => userBooks.id, { onDelete: 'restrict' }),
		borrowerId: text('borrower_id')
			.notNull()
			.references(() => user.id, { onDelete: 'restrict' }),
		ownerId: text('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'restrict' }),
		status: loanStatusEnum('status').default('requested').notNull(),
		requestedAt: timestamp('requested_at').defaultNow().notNull(),
		acceptedAt: timestamp('accepted_at'),
		activeAt: timestamp('active_at'),
		returnRequestedAt: timestamp('return_requested_at'),
		returnedAt: timestamp('returned_at'),
		dueDate: timestamp('due_date'),
		notes: text('notes'),
		ownerNotes: text('owner_notes')
	},
	(table) => [
		index('loans_borrower_idx').on(table.borrowerId),
		index('loans_owner_idx').on(table.ownerId),
		index('loans_user_book_idx').on(table.userBookId),
		index('loans_status_idx').on(table.status),
		pgPolicy('loans_select', {
			for: 'select',
			to: appUser,
			using: sql`${table.ownerId} = ${currentUserId}
				or ${table.borrowerId} = ${currentUserId}`
		}),
		pgPolicy('loans_insert', {
			for: 'insert',
			to: appUser,
			withCheck: sql`${table.borrowerId} = ${currentUserId}`
		}),
		pgPolicy('loans_update', {
			for: 'update',
			to: appUser,
			using: sql`${table.ownerId} = ${currentUserId}
				or ${table.borrowerId} = ${currentUserId}`
		}),
		pgPolicy('loans_delete', {
			for: 'delete',
			to: appUser,
			using: sql`${table.borrowerId} = ${currentUserId}
				and ${table.status} = 'requested'`
		})
	]
);

// ─── Book Reviews ─────────────────────────────────────────────────────────────
// Cualquier usuario autenticado puede reseñar cualquier libro del catálogo,
// independientemente de quién sea el propietario. Una reseña por usuario y libro.

export const bookReviews = pgTable(
	'book_reviews',
	{
		id: text('id').primaryKey(),
		bookId: text('book_id')
			.notNull()
			.references(() => books.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		rating: integer('rating').notNull(), // 1–5 estrellas
		body: text('body'), // texto opcional de la reseña
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('book_reviews_book_user_idx').on(table.bookId, table.userId),
		index('book_reviews_book_idx').on(table.bookId),
		index('book_reviews_user_idx').on(table.userId),
		// Lectura abierta a todos los usuarios autenticados (como books)
		pgPolicy('book_reviews_select', { for: 'select', to: appUser, using: sql`true` }),
		// Solo el autor puede insertar su propia reseña
		pgPolicy('book_reviews_insert', {
			for: 'insert',
			to: appUser,
			withCheck: sql`${table.userId} = ${currentUserId}`
		}),
		// Solo el autor puede editar su reseña
		pgPolicy('book_reviews_update', {
			for: 'update',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId}`
		}),
		// Solo el autor puede borrar su reseña
		pgPolicy('book_reviews_delete', {
			for: 'delete',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId}`
		})
	]
);

// ─── Invitations ──────────────────────────────────────────────────────────────
// Librarian es una red por invitación: cualquiera invita por email y el enlace
// (/invitacion/<token>) caduca a los 7 días. Solo se crea cuenta con contraseña
// desde una invitación pendiente (hook de /sign-up/email en auth-options.ts);
// quien entra con Seilide ya viene invitado allí. Se lee por token antes de
// tener cuenta, así que solo la toca invitations.ts, sin RLS.

export const invitations = pgTable(
	'invitations',
	{
		id: text('id').primaryKey(),
		email: text('email').notNull(),
		// Opaco y único: el `/invitacion/<token>` del enlace. Uno nuevo al reenviarla.
		token: text('token').notNull().unique(),
		invitedBy: text('invited_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		expiresAt: timestamp('expires_at').notNull(),
		// Aceptada: la cuenta se creó con ella.
		usedAt: timestamp('used_at'),
		cancelledAt: timestamp('cancelled_at')
	},
	(table) => [
		// Una invitación abierta por email; una usada o cancelada no impide otra.
		uniqueIndex('invitations_open_email_idx')
			.on(sql`lower(${table.email})`)
			.where(sql`${table.usedAt} is null and ${table.cancelledAt} is null`),
		index('invitations_invited_by_idx').on(table.invitedBy)
	]
);

// ─── User API keys ────────────────────────────────────────────────────────────
// La clave de OpenRouter de cada usuario (escanear estanterías, sugerir
// etiquetas, buscar portadas), cifrada con KMS_MASTER_KEY (kms.ts). Una por
// usuario; solo la ve y la cambia su dueño.

export const userApiKeys = pgTable(
	'user_api_keys',
	{
		userId: text('user_id')
			.primaryKey()
			.references(() => user.id, { onDelete: 'cascade' }),
		encryptedApiKey: text('encrypted_api_key').notNull(),
		iv: text('iv').notNull(),
		authTag: text('auth_tag').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull()
	},
	(table) => [
		pgPolicy('user_api_keys_all', {
			for: 'all',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId}`,
			withCheck: sql`${table.userId} = ${currentUserId}`
		})
	]
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const booksRelations = relations(books, ({ many }) => ({
	userBooks: many(userBooks),
	reviews: many(bookReviews)
}));

export const bookReviewsRelations = relations(bookReviews, ({ one }) => ({
	book: one(books, { fields: [bookReviews.bookId], references: [books.id] }),
	user: one(user, { fields: [bookReviews.userId], references: [user.id] })
}));

export const userBooksRelations = relations(userBooks, ({ one, many }) => ({
	user: one(user, { fields: [userBooks.userId], references: [user.id] }),
	library: one(libraries, { fields: [userBooks.libraryId], references: [libraries.id] }),
	book: one(books, { fields: [userBooks.bookId], references: [books.id] }),
	tags: many(userBookTags),
	loans: many(loans)
}));

export const librariesRelations = relations(libraries, ({ one, many }) => ({
	user: one(user, { fields: [libraries.userId], references: [user.id] }),
	userBooks: many(userBooks)
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
	user: one(user, { fields: [tags.userId], references: [user.id] }),
	userBookTags: many(userBookTags),
	sharedTags: many(sharedTags)
}));

export const userBookTagsRelations = relations(userBookTags, ({ one }) => ({
	userBook: one(userBooks, { fields: [userBookTags.userBookId], references: [userBooks.id] }),
	tag: one(tags, { fields: [userBookTags.tagId], references: [tags.id] })
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
	createdBy: one(user, { fields: [groups.createdBy], references: [user.id] }),
	members: many(groupMembers),
	sharedTags: many(sharedTags),
	inviteCode: one(groupInviteCodes, { fields: [groups.id], references: [groupInviteCodes.groupId] })
}));

export const groupInviteCodesRelations = relations(groupInviteCodes, ({ one }) => ({
	group: one(groups, { fields: [groupInviteCodes.groupId], references: [groups.id] })
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
	group: one(groups, { fields: [groupMembers.groupId], references: [groups.id] }),
	user: one(user, { fields: [groupMembers.userId], references: [user.id] })
}));

export const sharedTagsRelations = relations(sharedTags, ({ one }) => ({
	tag: one(tags, { fields: [sharedTags.tagId], references: [tags.id] }),
	group: one(groups, { fields: [sharedTags.groupId], references: [groups.id] }),
	sharedBy: one(user, { fields: [sharedTags.sharedBy], references: [user.id] })
}));

export const loansRelations = relations(loans, ({ one }) => ({
	userBook: one(userBooks, { fields: [loans.userBookId], references: [userBooks.id] }),
	borrower: one(user, { fields: [loans.borrowerId], references: [user.id] }),
	owner: one(user, { fields: [loans.ownerId], references: [user.id] })
}));
