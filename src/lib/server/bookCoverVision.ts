// Identifica un libro a partir de una foto de su portada, con la clave de
// OpenRouter del usuario, y lo casa con una obra de OpenLibrary.
//
// Dos pasos:
//  1. La IA lee la portada (título, autor, editorial…) y, si es una
//     traducción, aporta el título original por su cuenta. Con eso se buscan
//     obras candidatas en OpenLibrary, en varios intentos.
//  2. Se le enseña la foto junto a las portadas de las candidatas y dice cuáles
//     son la misma obra y cuáles tienen la misma portada. Comparar imágenes que
//     tiene delante se le da mucho mejor que reconocer portadas de memoria.
//
// La IA no es la fuente de verdad: el usuario elige la obra al final.
import { askVisionModel, toBox, toConfidence } from './openrouterVision';
import { searchBooks } from './openlibrary';
import type { AiLogContext } from './aiUsage';
import type {
	BookCoverCandidate as CoverCandidate,
	BookCoverMatch as CoverMatch,
	BookCoverReading as CoverReading,
	BookCoverScan as CoverScan,
	BookSearchResult
} from '$lib/types';

const MAX_CANDIDATES = 6;
const PER_SEARCH = 4;
const COVER_FETCH_TIMEOUT_MS = 5_000;
const MAX_COVER_BYTES = 300 * 1024;

// ─── 1. Leer la portada ───────────────────────────────────────────────────────

const READ_PROMPT = `You are looking at a photo of the front cover of ONE book.

Return what is printed on it:
- "title": the title exactly as printed (keep its language).
- "subtitle": the subtitle if printed, else null.
- "authors": the author names as printed, as an array (empty if none is printed).
- "original_title": if this is a translation and you KNOW the work's original title, that title; else null. Never guess.
- "publisher": the publisher or imprint if printed or shown by its logo, else null.
- "language": ISO 639-1 code of the language of the cover text ("es", "en"…), else null.
- "confidence": "high", "medium" or "low". Use "low" if the text is partly hidden, blurry, or you are unsure.
- "box_2d": the bounding box of the front cover as [ymin, xmin, ymax, xmax] normalized to 0-1000.

If you cannot read a title, return an empty array. Do not invent anything.

Respond with ONLY a JSON array with at most one object (no markdown, no explanation):
[{"title": "...", "subtitle": null, "authors": ["..."], "original_title": null, "publisher": null, "language": "es", "confidence": "high", "box_2d": [0, 0, 1000, 1000]}]`;

function optionalString(value: unknown, max = 500): string | null {
	return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

export function toReading(items: unknown[]): CoverReading[] {
	for (const item of items) {
		if (typeof item !== 'object' || item === null) continue;
		const c = item as Record<string, unknown>;
		const title = optionalString(c.title);
		if (!title) continue;
		const authors = Array.isArray(c.authors)
			? c.authors
					.map((a) => optionalString(a, 200))
					.filter((a): a is string => a !== null)
					.slice(0, 5)
			: [];
		const originalTitle = optionalString(c.original_title);
		return [
			{
				title,
				subtitle: optionalString(c.subtitle),
				authors,
				originalTitle:
					originalTitle && originalTitle.toLowerCase() !== title.toLowerCase()
						? originalTitle
						: null,
				publisher: optionalString(c.publisher, 200),
				language: optionalString(c.language, 8),
				confidence: toConfidence(c.confidence),
				box: toBox(c.box_2d)
			}
		];
	}
	return [];
}

export async function readCover(
	apiKey: string,
	imageDataUrl: string,
	log?: AiLogContext
): Promise<CoverReading | null> {
	const result = await askVisionModel(apiKey, READ_PROMPT, imageDataUrl, {
		label: 'readCover',
		log,
		toResults: toReading
	});
	return result?.[0] ?? null;
}

// ─── Buscar obras candidatas ──────────────────────────────────────────────────

/** Las búsquedas a probar, de la más precisa a la más amplia, sin repetir. */
export function searchQueries(reading: CoverReading): string[] {
	const author = reading.authors[0] ?? '';
	const queries = [
		[reading.title, author],
		[reading.originalTitle ?? '', author],
		[reading.title, '']
	]
		.filter(([title]) => title)
		.map((parts) => parts.filter(Boolean).join(' '));
	return [...new Set(queries)];
}

/** Junta los resultados de cada búsqueda en orden, sin repetir obra. */
export function mergeResults(lists: BookSearchResult[][], max: number): BookSearchResult[] {
	const seen = new Set<string>();
	const merged: BookSearchResult[] = [];
	for (const list of lists) {
		for (const book of list.slice(0, PER_SEARCH)) {
			if (seen.has(book.id)) continue;
			seen.add(book.id);
			merged.push(book);
			if (merged.length >= max) return merged;
		}
	}
	return merged;
}

export async function findCandidateWorks(reading: CoverReading): Promise<BookSearchResult[]> {
	const lists = await Promise.all(
		searchQueries(reading).map((q) => searchBooks(q, 10).catch(() => []))
	);
	return mergeResults(lists, MAX_CANDIDATES);
}

// ─── 2. Comparar con las portadas de las candidatas ───────────────────────────

const COMPARE_PROMPT = `The first image is a photo of the front cover of a book the user owns. After it come candidate records from a book catalog, each with its title and authors and, when available, the catalog's cover image.

For each candidate decide:
- "same_work": true if it is the SAME WORK as the photographed book, in any edition or translation. false if it is a different book: one that only shares the title, a study guide, a summary, an anthology or collection, a sequel, etc.
- "same_cover": true only if its cover image shows the same cover design as the photo (same artwork and layout; small differences in size or colour are fine). false if it differs or there is no image.

Respond with ONLY a JSON array (no markdown, no explanation), one object per candidate:
[{"candidate": 1, "same_work": true, "same_cover": false}]`;

// La portada de OpenLibrary se descarga aquí y se manda en base64: así no
// depende de que OpenRouter o el modelo puedan seguir sus redirecciones.
async function fetchCoverAsDataUrl(url: string): Promise<string | null> {
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(COVER_FETCH_TIMEOUT_MS) });
		if (!res.ok) return null;
		const type = res.headers.get('content-type') ?? '';
		if (!/^image\/(jpeg|png|webp)/.test(type)) return null;
		const bytes = new Uint8Array(await res.arrayBuffer());
		// OpenLibrary devuelve un GIF/JPEG de 1×1 cuando no tiene la portada.
		if (bytes.length < 1000 || bytes.length > MAX_COVER_BYTES) return null;
		return `data:${type.split(';')[0]};base64,${Buffer.from(bytes).toString('base64')}`;
	} catch {
		return null;
	}
}

type Verdict = { index: number; sameWork: boolean; sameCover: boolean };

export function toVerdicts(items: unknown[], count: number): Verdict[] {
	const verdicts: Verdict[] = [];
	for (const item of items) {
		if (typeof item !== 'object' || item === null) continue;
		const c = item as Record<string, unknown>;
		const n = typeof c.candidate === 'string' ? Number(c.candidate) : c.candidate;
		if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > count) continue;
		if (verdicts.some((v) => v.index === n - 1)) continue;
		const sameWork = c.same_work === true;
		verdicts.push({ index: n - 1, sameWork, sameCover: sameWork && c.same_cover === true });
	}
	return verdicts;
}

/** Misma portada primero, luego misma obra, luego sin juzgar y al final las que no lo son. */
export function rankCandidates(
	candidates: BookSearchResult[],
	verdicts: Verdict[] | null
): CoverCandidate[] {
	const byIndex = new Map(verdicts?.map((v) => [v.index, v]));
	const rank: Record<string, number> = { cover: 0, work: 1, null: 2, other: 3 };
	return candidates
		.map((book, i) => {
			const v = byIndex.get(i);
			const match: CoverMatch = !verdicts
				? null
				: !v
					? null
					: v.sameCover
						? 'cover'
						: v.sameWork
							? 'work'
							: 'other';
			return { ...book, match, i };
		})
		.sort((a, b) => rank[String(a.match)] - rank[String(b.match)] || a.i - b.i)
		.map(({ i: _i, ...book }) => book);
}

export async function compareWithCandidates(
	apiKey: string,
	imageDataUrl: string,
	candidates: BookSearchResult[],
	log?: AiLogContext
): Promise<Verdict[] | null> {
	const covers = await Promise.all(
		candidates.map((c) => (c.coverUrl ? fetchCoverAsDataUrl(c.coverUrl) : null))
	);
	const images = [
		{ caption: 'Photo of the book:', url: imageDataUrl },
		...candidates.map((c, i) => ({
			caption: `Candidate ${i + 1}: "${c.title}"${c.authors.length ? ` by ${c.authors.join(', ')}` : ''}${c.publishYear ? ` (first published ${c.publishYear})` : ''}${covers[i] ? '' : ' — no cover image'}`,
			url: covers[i]
		}))
	];
	return askVisionModel(apiKey, COMPARE_PROMPT, images, {
		label: 'compareCovers',
		log,
		toResults: (items) => toVerdicts(items, candidates.length)
	});
}

// ─── Todo junto ───────────────────────────────────────────────────────────────

/** Best-effort: si algo falla, devuelve lo que haya (lectura sin candidatas, o candidatas sin juzgar). */
export async function scanBookCover(
	apiKey: string,
	imageDataUrl: string,
	log?: AiLogContext
): Promise<CoverScan> {
	const reading = await readCover(apiKey, imageDataUrl, log);
	if (!reading) return { reading: null, candidates: [] };

	const works = await findCandidateWorks(reading);
	if (works.length === 0) return { reading, candidates: [] };

	// La comparación se apunta aparte en el consumo de IA: su resultCount son
	// candidatas juzgadas, no libros reconocidos.
	const compareLog = log && { ...log, kind: 'book_cover_compare' as const };
	const verdicts = await compareWithCandidates(apiKey, imageDataUrl, works, compareLog);
	return { reading, candidates: rankCandidates(works, verdicts) };
}
