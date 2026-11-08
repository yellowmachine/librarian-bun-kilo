// Utilidades de imagen en el navegador (canvas): reducir fotos antes de
// mandarlas y recortar la carátula que ha localizado la IA.

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new window.Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error('Could not read image'));
		img.src = src;
	});
}

function toJpeg(
	img: HTMLImageElement,
	sx: number,
	sy: number,
	sw: number,
	sh: number,
	maxDim: number,
	quality: number
): string {
	const scale = Math.min(1, maxDim / Math.max(sw, sh));
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(sw * scale));
	canvas.height = Math.max(1, Math.round(sh * scale));
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('canvas unavailable');
	ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
	return canvas.toDataURL('image/jpeg', quality);
}

/** Foto del usuario → data URL JPEG con el lado mayor ≤ maxDim. */
export async function resizeImageFile(file: File, maxDim = 1600, quality = 0.85): Promise<string> {
	const url = URL.createObjectURL(file);
	try {
		const img = await loadImage(url);
		return toJpeg(img, 0, 0, img.naturalWidth, img.naturalHeight, maxDim, quality);
	} finally {
		URL.revokeObjectURL(url);
	}
}

/**
 * Recorta de una foto (data URL) la caja [top, left, bottom, right] en
 * fracciones 0–1, con un pequeño margen, y la reduce para usarla de portada.
 * Sin caja, usa la foto entera.
 */
export async function cropImage(
	dataUrl: string,
	box: [number, number, number, number] | null,
	maxDim = 800,
	quality = 0.82
): Promise<string> {
	const img = await loadImage(dataUrl);
	const w = img.naturalWidth;
	const h = img.naturalHeight;
	if (!box) return toJpeg(img, 0, 0, w, h, maxDim, quality);

	const [top, left, bottom, right] = box;
	const pad = 0.01;
	const x0 = Math.max(0, (left - pad) * w);
	const y0 = Math.max(0, (top - pad) * h);
	const x1 = Math.min(w, (right + pad) * w);
	const y1 = Math.min(h, (bottom + pad) * h);
	return toJpeg(img, x0, y0, x1 - x0, y1 - y0, maxDim, quality);
}
