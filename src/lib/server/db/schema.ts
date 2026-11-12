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
	check,
	customType,
	doublePrecision
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

// Qué se presta (loans.item_kind): se guarda aparte del enlace porque el
// enlace se pierde si el dueño borra la copia, y el historial debe seguir
// sabiendo qué era.
export const loanItemKindEnum = pgEnum('loan_item_kind', ['book', 'movie']);

// Para qué se llamó a la IA (ai_usage_log.kind).
export const aiCallKindEnum = pgEnum('ai_call_kind', [
	'book_shelf_scan', // libros desde una foto de estantería
	'movie_scan', // películas desde una foto de carátulas o lomos
	'book_tags', // etiquetas sugeridas para un libro
	'movie_tags', // etiquetas sugeridas para una película
	'book_cover_search', // portada de un libro buscada en la web
	'book_cover_scan', // un libro desde una foto de su portada (leerla)
	'book_cover_compare', // esa foto comparada con las portadas de las obras candidatas
	'book_isbn_scan' // el ISBN leído de una foto, cuando el lector de códigos no puede
]);

// Soporte físico de una copia de la videoteca (user_movies.format).
export const mediaFormatEnum = pgEnum('media_format', ['dvd', 'bluray', 'uhd_bluray']);

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
// Si la copia de película es del usuario, sin pasar por la RLS de user_movies:
// su política de grupos lee user_movie_tags, y la de inserción de
// user_movie_tags no puede leer user_movies sin entrar en recursión (42P17).
const ownsUserMovie = (userMovieId: unknown, userId: unknown) =>
	sql`owns_user_movie(${userMovieId}, ${userId})`;
// Lo mismo para libros (user_books_select_in_group lee user_book_tags).
const ownsUserBook = (userBookId: unknown, userId: unknown) =>
	sql`owns_user_book(${userBookId}, ${userId})`;

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

// ─── Movies ───────────────────────────────────────────────────────────────────
// Catálogo global de películas, rellenado desde TMDB (src/lib/server/tmdb.ts).
// Mismo papel que `books` para la videoteca.

export const movies = pgTable(
	'movies',
	{
		id: text('id').primaryKey(), // "tmdb-<id>", ej: "tmdb-78"
		// Título en castellano (TMDB con language=es-ES) y el original.
		title: text('title').notNull(),
		originalTitle: text('original_title'),
		releaseYear: integer('release_year'),
		directors: text('directors').array(),
		// Reparto principal, en el orden de los créditos. null = aún no se ha
		// pedido a TMDB (películas dadas de alta antes de guardarlo).
		cast: text('cast').array(),
		runtime: integer('runtime'), // minutos
		genres: text('genres').array(),
		overview: text('overview'),
		posterUrl: text('poster_url'),
		tmdbData: text('tmdb_data'), // JSON raw guardado como text
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull()
	},
	() => [
		// Catálogo global: lectura y escritura sin restricción de usuario
		pgPolicy('movies_select', { for: 'select', to: appUser, using: sql`true` }),
		pgPolicy('movies_insert', { for: 'insert', to: appUser, withCheck: sql`true` }),
		pgPolicy('movies_update', { for: 'update', to: appUser, using: sql`true` })
	]
);

// ─── User Movies ──────────────────────────────────────────────────────────────
// Cada fila es una copia física (DVD, Blu-ray…) de un usuario. Comparte las
// bibliotecas con los libros: «Casa» u «Oficina» son sitios, no tipos de cosa.
// La ve su dueño, los miembros de un grupo con el que comparte una de sus
// etiquetas, y quien la ha pedido prestada.

export const userMovies = pgTable(
	'user_movies',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		libraryId: text('library_id')
			.notNull()
			.references(() => libraries.id, { onDelete: 'restrict' }),
		// Nullable: null significa alta manual (la película no está en TMDB)
		movieId: text('movie_id').references(() => movies.id, { onDelete: 'restrict' }),
		// Campos de alta manual — tapan movies.* cuando movieId es null
		title: text('title'),
		originalTitle: text('original_title'),
		directors: text('directors').array(),
		releaseYear: integer('release_year'),
		overview: text('overview'),
		// Portada propia (p.ej. la de esta edición concreta). Igual que en
		// user_books, también vale para películas de catálogo y tapa
		// movies.poster_url.
		coverUrl: text('cover_url'),
		format: mediaFormatEnum('format').notNull(),
		// Texto libre: «Steelbook», «Edición coleccionista», «Montaje del director»…
		edition: text('edition'),
		notes: text('notes'),
		isAvailable: boolean('is_available').default(true).notNull(),
		addedAt: timestamp('added_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull()
	},
	(table) => [
		// Se puede tener la misma película en varios formatos (o varias copias),
		// así que (userId, movieId) NO es único.
		index('user_movies_user_idx').on(table.userId),
		index('user_movies_movie_idx').on(table.movieId),
		index('user_movies_library_idx').on(table.libraryId),
		check(
			'user_movies_movie_or_title',
			sql`${table.movieId} IS NOT NULL OR ${table.title} IS NOT NULL`
		),
		pgPolicy('user_movies_select', {
			for: 'select',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId}`
		}),
		// Igual que los libros: un miembro de un grupo ve las películas que
		// llevan una etiqueta compartida con ese grupo.
		pgPolicy('user_movies_select_in_group', {
			for: 'select',
			to: appUser,
			using: sql`exists (
				select 1 from user_movie_tags umt
				join shared_tags st on st.tag_id = umt.tag_id
				join group_members gm on gm.group_id = st.group_id
				where umt.user_movie_id = ${table.id}
				  and gm.user_id = ${currentUserId}
			)`
		}),
		// Quien la pide prestada la ve (como user_books_select_on_loan)
		pgPolicy('user_movies_select_on_loan', {
			for: 'select',
			to: appUser,
			using: sql`exists (
				select 1 from loans l
				where l.user_movie_id = ${table.id}
				  and l.borrower_id = ${currentUserId}
			)`
		}),
		pgPolicy('user_movies_insert', {
			for: 'insert',
			to: appUser,
			withCheck: sql`${table.userId} = ${currentUserId}`
		}),
		pgPolicy('user_movies_update', {
			for: 'update',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId}`
		}),
		pgPolicy('user_movies_delete', {
			for: 'delete',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId}`
		})
	]
);

// ─── Movie cover photos ───────────────────────────────────────────────────────
// La foto que el usuario hizo a SU carátula (recortada y reducida en el
// navegador, ~100 KB), para cuando prefiere su edición al póster de TMDB.
// Va en la base de datos y no en disco: es poca cosa y así entra en las copias
// de seguridad sin montar nada más. user_movies.cover_url apunta a
// /api/movies/<id>/cover, que la sirve.

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
	dataType() {
		return 'bytea';
	}
});

export const movieCoverPhotos = pgTable(
	'movie_cover_photos',
	{
		userMovieId: text('user_movie_id')
			.primaryKey()
			.references(() => userMovies.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		contentType: text('content_type').notNull(),
		data: bytea('data').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		// La ve quien pueda ver la película (la subconsulta pasa por la RLS de
		// user_movies: dueño, grupos…); si no, a los demás les saldría rota.
		pgPolicy('movie_cover_photos_select', {
			for: 'select',
			to: appUser,
			using: sql`exists (select 1 from user_movies um where um.id = ${table.userMovieId})`
		}),
		pgPolicy('movie_cover_photos_insert', {
			for: 'insert',
			to: appUser,
			withCheck: sql`${table.userId} = ${currentUserId}`
		}),
		pgPolicy('movie_cover_photos_update', {
			for: 'update',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId}`
		}),
		pgPolicy('movie_cover_photos_delete', {
			for: 'delete',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId}`
		})
	]
);

// ─── Book cover photos ────────────────────────────────────────────────────────
// Lo mismo para libros: la foto que el usuario hizo a la portada de SU
// ejemplar al darlo de alta. user_books.cover_url apunta a
// /api/books/<id>/cover, que la sirve.

export const bookCoverPhotos = pgTable(
	'book_cover_photos',
	{
		userBookId: text('user_book_id')
			.primaryKey()
			.references(() => userBooks.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		contentType: text('content_type').notNull(),
		data: bytea('data').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		// La ve quien pueda ver el libro (la subconsulta pasa por la RLS de
		// user_books); solo su dueño la cambia o la borra.
		pgPolicy('book_cover_photos_select', {
			for: 'select',
			to: appUser,
			using: sql`exists (select 1 from user_books ub where ub.id = ${table.userBookId})`
		}),
		pgPolicy('book_cover_photos_insert', {
			for: 'insert',
			to: appUser,
			withCheck: sql`${table.userId} = ${currentUserId}`
		}),
		pgPolicy('book_cover_photos_update', {
			for: 'update',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId}`
		}),
		pgPolicy('book_cover_photos_delete', {
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
		// Etiqueta Y libro propios: si bastara con la etiqueta, se podría poner
		// una propia, compartida con otro grupo, a un libro ajeno visible por
		// grupo, y exponerlo a gente que su dueño no eligió.
		pgPolicy('user_book_tags_insert', {
			for: 'insert',
			to: appUser,
			withCheck: sql`exists (
				select 1 from tags t
				where t.id = ${table.tagId}
				  and t.user_id = ${currentUserId}
			) and ${ownsUserBook(table.userBookId, currentUserId)}`
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

// ─── User Movie Tags ──────────────────────────────────────────────────────────
// Mismas etiquetas que los libros: compartir una con un grupo comparte los
// libros Y las películas que la llevan.
//
// A diferencia de user_book_tags, insertar exige que la película también sea
// tuya (no solo la etiqueta): si no, se podría poner una etiqueta propia
// compartida a una película ajena visible por un grupo y exponerla a otro.

export const userMovieTags = pgTable(
	'user_movie_tags',
	{
		userMovieId: text('user_movie_id')
			.notNull()
			.references(() => userMovies.id, { onDelete: 'cascade' }),
		tagId: text('tag_id')
			.notNull()
			.references(() => tags.id, { onDelete: 'cascade' })
	},
	(table) => [
		uniqueIndex('user_movie_tags_pk').on(table.userMovieId, table.tagId),
		index('user_movie_tags_tag_idx').on(table.tagId),
		pgPolicy('user_movie_tags_select', {
			for: 'select',
			to: appUser,
			using: sql`exists (
				select 1 from tags t
				where t.id = ${table.tagId}
				  and t.user_id = ${currentUserId}
			)`
		}),
		pgPolicy('user_movie_tags_select_in_group', {
			for: 'select',
			to: appUser,
			using: sql`exists (
				select 1 from shared_tags st
				join group_members gm on gm.group_id = st.group_id
				where st.tag_id = ${table.tagId}
				  and gm.user_id = ${currentUserId}
			)`
		}),
		pgPolicy('user_movie_tags_insert', {
			for: 'insert',
			to: appUser,
			withCheck: sql`exists (
				select 1 from tags t
				where t.id = ${table.tagId}
				  and t.user_id = ${currentUserId}
			) and ${ownsUserMovie(table.userMovieId, currentUserId)}`
		}),
		pgPolicy('user_movie_tags_delete', {
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
		// Lo prestado: un libro O una película. Si el dueño borra la copia, el
		// enlace queda a null y el préstamo sigue en el historial con la foto
		// fija de abajo (item_*), tomada al pedirlo.
		itemKind: loanItemKindEnum('item_kind').notNull(),
		userBookId: text('user_book_id').references(() => userBooks.id, { onDelete: 'set null' }),
		userMovieId: text('user_movie_id').references(() => userMovies.id, {
			onDelete: 'set null'
		}),
		itemTitle: text('item_title').notNull(),
		itemCreators: text('item_creators').array(), // autores o directores
		itemCoverUrl: text('item_cover_url'), // solo URLs públicas (https)
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
		index('loans_user_movie_idx').on(table.userMovieId),
		// Como mucho un enlace (ninguno si la copia se borró), y del tipo que toca
		check(
			'loans_item_matches_kind',
			sql`(${table.itemKind} = 'book' and ${table.userMovieId} is null)
				or (${table.itemKind} = 'movie' and ${table.userBookId} is null)`
		),
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

// ─── Movie Reviews ────────────────────────────────────────────────────────────
// Como book_reviews: una reseña por usuario y película del catálogo (TMDB),
// visible para todos. Las películas dadas de alta a mano no tienen.

export const movieReviews = pgTable(
	'movie_reviews',
	{
		id: text('id').primaryKey(),
		movieId: text('movie_id')
			.notNull()
			.references(() => movies.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		rating: integer('rating').notNull(), // 1–5 estrellas
		body: text('body'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('movie_reviews_movie_user_idx').on(table.movieId, table.userId),
		index('movie_reviews_movie_idx').on(table.movieId),
		index('movie_reviews_user_idx').on(table.userId),
		check('movie_reviews_rating_range', sql`${table.rating} between 1 and 5`),
		pgPolicy('movie_reviews_select', { for: 'select', to: appUser, using: sql`true` }),
		pgPolicy('movie_reviews_insert', {
			for: 'insert',
			to: appUser,
			withCheck: sql`${table.userId} = ${currentUserId}`
		}),
		pgPolicy('movie_reviews_update', {
			for: 'update',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId}`
		}),
		pgPolicy('movie_reviews_delete', {
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

// ─── AI usage log ─────────────────────────────────────────────────────────────
// Una fila por llamada a OpenRouter con la clave del usuario, para que vea qué
// ha gastado y en qué. El coste es el que devuelve OpenRouter en cada
// respuesta (usage.cost, en dólares). Sin coste (null) si la llamada falló
// antes de que OpenRouter lo informara.

export const aiUsageLog = pgTable(
	'ai_usage_log',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		kind: aiCallKindEnum('kind').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		// De qué iba: «Dune», «Blade Runner»… (null en las fotos)
		subject: text('subject'),
		// Qué salió: libros o películas reconocidos, etiquetas sugeridas, portadas…
		resultCount: integer('result_count'),
		success: boolean('success').notNull(),
		// Si falló, por qué, corto: «HTTP 402», «timeout», «invalid response»…
		error: text('error'),
		model: text('model'),
		promptTokens: integer('prompt_tokens'),
		completionTokens: integer('completion_tokens'),
		costUsd: doublePrecision('cost_usd'),
		durationMs: integer('duration_ms'),
		// Id de la generación en OpenRouter, para cuadrar con su panel de actividad
		generationId: text('generation_id')
	},
	(table) => [
		index('ai_usage_log_user_date_idx').on(table.userId, table.createdAt),
		pgPolicy('ai_usage_log_select', {
			for: 'select',
			to: appUser,
			using: sql`${table.userId} = ${currentUserId}`
		}),
		pgPolicy('ai_usage_log_insert', {
			for: 'insert',
			to: appUser,
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
	userBooks: many(userBooks),
	userMovies: many(userMovies)
}));

export const moviesRelations = relations(movies, ({ many }) => ({
	userMovies: many(userMovies),
	reviews: many(movieReviews)
}));

export const movieReviewsRelations = relations(movieReviews, ({ one }) => ({
	movie: one(movies, { fields: [movieReviews.movieId], references: [movies.id] }),
	user: one(user, { fields: [movieReviews.userId], references: [user.id] })
}));

export const userMoviesRelations = relations(userMovies, ({ one, many }) => ({
	tags: many(userMovieTags),
	loans: many(loans),
	user: one(user, { fields: [userMovies.userId], references: [user.id] }),
	library: one(libraries, { fields: [userMovies.libraryId], references: [libraries.id] }),
	movie: one(movies, { fields: [userMovies.movieId], references: [movies.id] })
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
	user: one(user, { fields: [tags.userId], references: [user.id] }),
	userBookTags: many(userBookTags),
	userMovieTags: many(userMovieTags),
	sharedTags: many(sharedTags)
}));

export const userBookTagsRelations = relations(userBookTags, ({ one }) => ({
	userBook: one(userBooks, { fields: [userBookTags.userBookId], references: [userBooks.id] }),
	tag: one(tags, { fields: [userBookTags.tagId], references: [tags.id] })
}));

export const userMovieTagsRelations = relations(userMovieTags, ({ one }) => ({
	userMovie: one(userMovies, { fields: [userMovieTags.userMovieId], references: [userMovies.id] }),
	tag: one(tags, { fields: [userMovieTags.tagId], references: [tags.id] })
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
	userMovie: one(userMovies, { fields: [loans.userMovieId], references: [userMovies.id] }),
	borrower: one(user, { fields: [loans.borrowerId], references: [user.id] }),
	owner: one(user, { fields: [loans.ownerId], references: [user.id] })
}));
