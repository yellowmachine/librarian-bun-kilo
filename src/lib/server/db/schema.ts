import { relations, sql } from 'drizzle-orm';
import {
	pgSchema,
	pgPolicy,
	pgRole,
	text,
	timestamp,
	boolean,
	integer,
	uniqueIndex,
	index
} from 'drizzle-orm/pg-core';

// ─── Schema ───────────────────────────────────────────────────────────────────
// Todas las tablas de la aplicación viven en el schema 'librarian'.
// Las tablas de better-auth (user, session, account, verification) permanecen
// en 'public', que es el schema por defecto de better-auth.
export const librarianSchema = pgSchema('librarian');

export * from './auth.schema';
import { user } from './auth.schema';

// ─── App role ─────────────────────────────────────────────────────────────────
// Rol de BD para queries de la aplicación. El superuser (root) tiene BYPASSRLS
// para las operaciones de better-auth y admin.

// .existing() indica a Drizzle que este rol ya existe (creado por init.sql)
// y NO debe emitir CREATE ROLE en las migraciones generadas.
export const appUser = pgRole('app_user').existing();

// ─── Enums ────────────────────────────────────────────────────────────────────

export const groupRoleEnum = librarianSchema.enum('group_role', ['owner', 'admin', 'member']);

export const loanStatusEnum = librarianSchema.enum('loan_status', [
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

// ─── User Profile ─────────────────────────────────────────────────────────────
// Marca que un usuario se registró a través de Librarian.
// Se crea en el momento del signup (antes de verificar el email).
// Si un usuario tiene public.user pero no este registro, vino de Scholio
// y no tiene acceso a Librarian.

export const userProfile = librarianSchema.table(
	'user_profile',
	{
		userId: text('user_id')
			.primaryKey()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		pgPolicy('user_profile_select', {
			for: 'select',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId}`
		})
	]
);

// ─── Books ────────────────────────────────────────────────────────────────────

export const books = librarianSchema.table(
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

// ─── User Books ───────────────────────────────────────────────────────────────

export const userBooks = librarianSchema.table(
	'user_books',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		bookId: text('book_id')
			.notNull()
			.references(() => books.id, { onDelete: 'restrict' }),
		notes: text('notes'),
		isAvailable: boolean('is_available').default(true).notNull(),
		addedAt: timestamp('added_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('user_books_user_book_idx').on(table.userId, table.bookId),
		index('user_books_user_idx').on(table.userId),
		index('user_books_book_idx').on(table.bookId),
		pgPolicy('user_books_select', {
			for: 'select',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId}`
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

export const tags = librarianSchema.table(
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

export const userBookTags = librarianSchema.table(
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
				select 1 from user_books ub
				where ub.id = ${table.userBookId}
				  and ub.user_id = ${currentUserId}
			)`
		}),
		pgPolicy('user_book_tags_insert', {
			for: 'insert',
			to: appUser,
			withCheck: sql`exists (
				select 1 from user_books ub
				where ub.id = ${table.userBookId}
				  and ub.user_id = ${currentUserId}
			)`
		}),
		pgPolicy('user_book_tags_delete', {
			for: 'delete',
			to: appUser,
			using: sql`exists (
				select 1 from user_books ub
				where ub.id = ${table.userBookId}
				  and ub.user_id = ${currentUserId}
			)`
		})
	]
);

// ─── Groups ───────────────────────────────────────────────────────────────────

export const groups = librarianSchema.table(
	'groups',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		description: text('description'),
		inviteCode: text('invite_code').unique(),
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
			using: sql`exists (
				select 1 from group_members gm
				where gm.group_id = ${table.id}
				  and gm.user_id = ${currentUserId}
			)`
		}),
		pgPolicy('groups_insert', {
			for: 'insert',
			to: appUser,
			withCheck: sql`${table.createdBy} = ${currentUserId}`
		}),
		pgPolicy('groups_update', {
			for: 'update',
			to: appUser,
			using: sql`exists (
				select 1 from group_members gm
				where gm.group_id = ${table.id}
				  and gm.user_id = ${currentUserId}
				  and gm.role in ('owner', 'admin')
			)`
		}),
		pgPolicy('groups_delete', {
			for: 'delete',
			to: appUser,
			using: sql`exists (
				select 1 from group_members gm
				where gm.group_id = ${table.id}
				  and gm.user_id = ${currentUserId}
				  and gm.role = 'owner'
			)`
		})
	]
);

// ─── Group Members ────────────────────────────────────────────────────────────

export const groupMembers = librarianSchema.table(
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
			using: sql`${table.userId} = ${currentUserId}`
		}),
		// Solo owners/admins pueden añadir miembros.
		// El flujo joinGroupByCode corre como superuser (bypass RLS) por lo que
		// no necesita pasar por esta política.
		pgPolicy('group_members_insert', {
			for: 'insert',
			to: appUser,
			withCheck: sql`exists (
					select 1 from group_members gm
					where gm.group_id = ${table.groupId}
					  and gm.user_id = ${currentUserId}
					  and gm.role in ('owner', 'admin')
				)`
		}),
		pgPolicy('group_members_delete', {
			for: 'delete',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId}`
		})
	]
);

// ─── Shared Tags ──────────────────────────────────────────────────────────────

export const sharedTags = librarianSchema.table(
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
			using: sql`exists (
				select 1 from group_members gm
				where gm.group_id = ${table.groupId}
				  and gm.user_id = ${currentUserId}
			)`
		}),
		pgPolicy('shared_tags_insert', {
			for: 'insert',
			to: appUser,
			withCheck: sql`${table.sharedBy} = ${currentUserId}
				and exists (
					select 1 from group_members gm
					where gm.group_id = ${table.groupId}
					  and gm.user_id = ${currentUserId}
				)`
		}),
		pgPolicy('shared_tags_delete', {
			for: 'delete',
			to: appUser,
			using: sql`${table.sharedBy} = ${currentUserId}
				or exists (
					select 1 from group_members gm
					where gm.group_id = ${table.groupId}
					  and gm.user_id = ${currentUserId}
					  and gm.role in ('owner', 'admin')
				)`
		})
	]
);

// ─── Loans ────────────────────────────────────────────────────────────────────

export const loans = librarianSchema.table(
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
		notes: text('notes')
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

export const bookReviews = librarianSchema.table(
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
	book: one(books, { fields: [userBooks.bookId], references: [books.id] }),
	tags: many(userBookTags),
	loans: many(loans)
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
	sharedTags: many(sharedTags)
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
