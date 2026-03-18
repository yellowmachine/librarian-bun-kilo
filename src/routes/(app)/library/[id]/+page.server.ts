import { error, fail } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { eq, and, inArray } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { getUserBook, updateUserBook, removeFromLibrary } from '$lib/server/books';
import { withRLS } from '$lib/server/db/rls';
import { tags, userBookTags, loans } from '$lib/server/db/schema';

export const load = async ({ locals, params }: RequestEvent) => {
	const book = await getUserBook(locals.user!.id, params.id!);
	if (!book) error(404, 'Libro no encontrado en tu biblioteca');

	const userTags = await withRLS(locals.user!.id, (tx) =>
		tx.select().from(tags).where(eq(tags.userId, locals.user!.id))
	);

	return { book, userTags };
};

export const actions = {
	// Actualizar notas y disponibilidad
	update: async ({ locals, params, request }: RequestEvent) => {
		const data = await request.formData();
		const notes = data.get('notes') as string | null;
		const isAvailable = data.get('isAvailable') === 'true';

		await updateUserBook(locals.user!.id, params.id!, {
			notes: notes ?? undefined,
			isAvailable
		});

		return { success: true };
	},

	// Crear etiqueta nueva y asignarla al libro
	createTag: async ({ locals, params, request }: RequestEvent) => {
		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();
		const color = (data.get('color') as string)?.trim() || null;

		if (!name) return fail(400, { error: 'El nombre es obligatorio' });

		const tagId = nanoid();
		await withRLS(locals.user!.id, async (tx) => {
			await tx.insert(tags).values({ id: tagId, userId: locals.user!.id, name, color });
			await tx.insert(userBookTags).values({ userBookId: params.id!, tagId });
		});

		return { success: true };
	},

	// Asignar etiqueta existente al libro
	addTag: async ({ locals, params, request }: RequestEvent) => {
		const data = await request.formData();
		const tagId = data.get('tagId') as string;
		if (!tagId) return fail(400, { error: 'tagId requerido' });

		await withRLS(locals.user!.id, (tx) =>
			tx.insert(userBookTags).values({ userBookId: params.id!, tagId }).onConflictDoNothing()
		);
		return { success: true };
	},

	// Quitar etiqueta del libro
	removeTag: async ({ locals, params, request }: RequestEvent) => {
		const data = await request.formData();
		const tagId = data.get('tagId') as string;
		if (!tagId) return fail(400, { error: 'tagId requerido' });

		await withRLS(locals.user!.id, (tx) =>
			tx
				.delete(userBookTags)
				.where(and(eq(userBookTags.userBookId, params.id!), eq(userBookTags.tagId, tagId)))
		);
		return { success: true };
	},

	// Eliminar libro de la biblioteca
	remove: async ({ locals, params }: RequestEvent) => {
		// Verificar que no hay préstamos activos antes de eliminar
		// (la FK onDelete:restrict lanzaría un error de DB sin este guard)
		const activeLoans = await withRLS(locals.user!.id, (tx) =>
			tx
				.select({ id: loans.id })
				.from(loans)
				.where(
					and(
						eq(loans.userBookId, params.id!),
						inArray(loans.status, ['requested', 'accepted', 'active', 'return_requested'])
					)
				)
		);

		if (activeLoans.length > 0) {
			return fail(400, {
				error: 'No puedes eliminar este libro porque tiene un préstamo en curso.'
			});
		}

		await removeFromLibrary(locals.user!.id, params.id!);
		return { removed: true };
	}
};
