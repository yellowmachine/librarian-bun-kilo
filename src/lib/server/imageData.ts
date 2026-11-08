// Decodifica una imagen que llega como data URL (data:image/jpeg;base64,…) y
// comprueba por sus primeros bytes que de verdad es JPEG, PNG o WebP. El tipo
// que se guarda y se sirve sale de esos bytes, no de lo que diga el cliente:
// así nunca se sirve como imagen algo que no lo es.

export type ImageContentType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface DecodedImage {
	contentType: ImageContentType;
	bytes: Uint8Array;
}

const DATA_URL = /^data:image\/[a-z+.-]+;base64,([A-Za-z0-9+/]+={0,2})$/;

export function sniffImageType(bytes: Uint8Array): ImageContentType | null {
	if (bytes.length < 12) return null;
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
	if (
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47 &&
		bytes[4] === 0x0d &&
		bytes[5] === 0x0a
	) {
		return 'image/png';
	}
	const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
	if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
	return null;
}

/** null si no es un data URL de imagen válido o pasa de maxBytes. */
export function decodeImageDataUrl(dataUrl: string, maxBytes: number): DecodedImage | null {
	// Cota rápida antes de decodificar: base64 ocupa 4/3 del binario.
	if (dataUrl.length > Math.ceil((maxBytes * 4) / 3) + 64) return null;
	const match = dataUrl.match(DATA_URL);
	if (!match) return null;

	const bytes = new Uint8Array(Buffer.from(match[1], 'base64'));
	if (bytes.length === 0 || bytes.length > maxBytes) return null;

	const contentType = sniffImageType(bytes);
	return contentType ? { contentType, bytes } : null;
}
