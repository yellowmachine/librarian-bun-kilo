// Lee el ISBN de una foto (código de barras o texto «ISBN …») con la clave de
// OpenRouter del usuario. Es el último recurso cuando ni el lector en vivo ni
// el lector sobre la foto, ambos gratis, han podido con el código de barras:
// la IA lee las cifras impresas, que no dependen de que las barras estén
// arrugadas o mal iluminadas.
//
// Lo que diga la IA se valida con el dígito de control: si se equivoca en
// una cifra, el ISBN no pasa y no se busca nada.
import { askVisionModel } from './openrouterVision';
import type { AiLogContext } from './aiUsage';
import { cleanIsbn, firstValidIsbn, isValidIsbn } from '$lib/isbn';

const PROMPT = `You are looking at a photo of the back cover, inside page or barcode of a book.

Read every ISBN you can see: the digits printed under or above the barcode, and any text like "ISBN 978-84-376-0494-7" or "ISBN 0-14-044913-5". Copy the digits exactly as printed (an ISBN-10 may end in X). Ignore other numbers such as prices or the small add-on barcode.

If a digit is unreadable, skip that ISBN. Never guess or complete a number.

Respond with ONLY a JSON array of strings (no markdown, no explanation), e.g. ["9788437604947"]. Empty array if none is readable.`;

export interface IsbnReading {
	/** El ISBN válido (13 cifras si lo hay), o null si ninguno pasa el dígito de control. */
	isbn: string | null;
	/** Lo que leyó la IA, limpio, válido o no. */
	read: string[];
}

export function toReadIsbns(items: unknown[]): string[] {
	const read = items
		.filter((i): i is string | number => typeof i === 'string' || typeof i === 'number')
		.map((i) => cleanIsbn(String(i)))
		.filter((c) => c.length >= 10 && c.length <= 13);
	return [...new Set(read)].slice(0, 5);
}

/** Best-effort: si la llamada falla devuelve null; si no lee nada válido, isbn: null. */
export async function readIsbnFromImage(
	apiKey: string,
	imageDataUrl: string,
	log?: AiLogContext
): Promise<IsbnReading | null> {
	// resultCount (lo que se apunta en el consumo de IA) = ISBN válidos leídos.
	const read = await askVisionModel(apiKey, PROMPT, imageDataUrl, {
		label: 'readIsbnFromImage',
		log,
		toResults: toReadIsbns,
		countResults: (codes) => codes.filter(isValidIsbn).length
	});
	if (!read) return null;
	return { isbn: firstValidIsbn(read), read };
}
