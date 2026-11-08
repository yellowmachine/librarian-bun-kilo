import { error, fail, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getUserMovie, updateUserMovie, removeMovie } from '$lib/server/movies';
import { getUserLibraries } from '$lib/server/libraries';
import { isMediaFormat } from '$lib/mediaFormat';

export const load = async ({ locals, params }: RequestEvent) => {
	const [movie, userLibraries] = await Promise.all([
		getUserMovie(locals.user!.id, params.id!),
		getUserLibraries(locals.user!.id)
	]);
	if (!movie) error(404, 'Movie not found in your library');
	return { movie, userLibraries };
};

function optionalText(data: FormData, name: string, max: number): string | null {
	const value = (data.get(name) as string | null)?.trim() ?? '';
	return value ? value.slice(0, max) : null;
}

export const actions = {
	// Formato, edición, notas y disponibilidad
	update: async ({ locals, params, request }: RequestEvent) => {
		const data = await request.formData();
		const format = data.get('format');
		if (!isMediaFormat(format)) return fail(400, { error: 'Unknown format.' });

		await updateUserMovie(locals.user!.id, params.id!, {
			format,
			edition: optionalText(data, 'edition', 200),
			notes: optionalText(data, 'notes', 1000),
			isAvailable: data.get('isAvailable') === 'true'
		});
		return { success: true };
	},

	moveLibrary: async ({ locals, params, request }: RequestEvent) => {
		const libraryId = ((await request.formData()).get('libraryId') as string | null)?.trim();
		if (!libraryId) return fail(400, { error: 'Choose a library.' });
		try {
			await updateUserMovie(locals.user!.id, params.id!, { libraryId });
		} catch {
			return fail(404, { error: 'Library not found.' });
		}
		return { moved: true };
	},

	// Portada propia (URL https) o, vacía, volver al póster de TMDB
	setCover: async ({ locals, params, request }: RequestEvent) => {
		const raw = ((await request.formData()).get('coverUrl') as string | null)?.trim() ?? '';
		if (raw) {
			let url: URL;
			try {
				url = new URL(raw);
			} catch {
				return fail(400, { error: 'That isn’t a valid URL.' });
			}
			if (url.protocol !== 'https:' || raw.length > 2000) {
				return fail(400, { error: 'The cover URL must start with https://' });
			}
		}
		await updateUserMovie(locals.user!.id, params.id!, { coverUrl: raw || null });
		return { coverSaved: true };
	},

	remove: async ({ locals, params }: RequestEvent) => {
		await removeMovie(locals.user!.id, params.id!);
		redirect(303, '/movies');
	}
};
