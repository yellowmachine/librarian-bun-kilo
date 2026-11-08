import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getCoverPhoto, saveCoverPhoto } from '$lib/server/movies';
import { decodeImageDataUrl } from '$lib/server/imageData';

// El navegador ya la recorta y reduce (~100 KB); esto es solo un tope.
const MAX_PHOTO_BYTES = 600 * 1024;

// GET /api/movies/:id/cover — la foto propia de la carátula. Solo la ve su
// dueño (RLS). La URL lleva ?v=… y cambia con cada foto, así que se puede
// cachear como inmutable.
export async function GET({ locals, params }: RequestEvent) {
	if (!locals.user) error(401, 'Not authenticated');

	const photo = await getCoverPhoto(locals.user.id, params.id!);
	if (!photo) error(404, 'No cover photo');

	return new Response(new Uint8Array(photo.data), {
		headers: {
			'Content-Type': photo.contentType,
			'Cache-Control': 'private, max-age=31536000, immutable',
			'X-Content-Type-Options': 'nosniff'
		}
	});
}

// PUT /api/movies/:id/cover — Body: { image: "data:image/jpeg;base64,…" }
export async function PUT({ locals, params, request }: RequestEvent) {
	if (!locals.user) error(401, 'Not authenticated');

	const raw = await request.json().catch(() => null);
	const dataUrl = (raw as { image?: unknown } | null)?.image;
	if (typeof dataUrl !== 'string') error(400, 'image is required.');

	const image = decodeImageDataUrl(dataUrl, MAX_PHOTO_BYTES);
	if (!image) error(400, 'The image must be a JPEG, PNG or WebP of up to 600 KB.');

	const saved = await saveCoverPhoto(locals.user.id, params.id!, image);
	if (!saved) error(404, 'Movie not found in your library');

	return json({ ok: true });
}
