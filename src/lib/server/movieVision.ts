// Identifica películas en una foto de carátulas (o lomos) de DVD / Blu-ray,
// con la clave de OpenRouter del usuario, y las casa con TMDB.
//
// Como con las portadas de libros, la IA no es la fuente de verdad: lee lo
// que pone la caja y TMDB aporta la ficha. El usuario confirma cada una.
import { askVisionModel, toBox, toConfidence } from './openrouterVision';
import { searchMovies } from './tmdb';
import type { AiLogContext } from './aiUsage';
import { isMediaFormat, type MediaFormat } from '$lib/mediaFormat';
import type { MovieSearchResult } from '$lib/types';

const MAX_CANDIDATES = 20;
const MAX_MATCHES = 4;

export interface MovieCandidate {
	title: string;
	originalTitle: string | null;
	releaseYear: number | null;
	director: string | null;
	format: MediaFormat | null;
	edition: string | null;
	confidence: 'high' | 'medium' | 'low';
	/** Carátula delantera en la foto, en fracciones 0–1: [top, left, bottom, right]. */
	box: [number, number, number, number] | null;
}

const PROMPT = `You are looking at a photo of one or more home-video cases: DVD, Blu-ray or 4K Ultra HD Blu-ray. It may show front covers, or spines on a shelf.

For every movie you can identify, return:
- "title": the title as printed on the case (keep its language).
- "original_title": the original title if it is ALSO printed and differs, else null.
- "year": the release year if printed or if you are sure of it, else null.
- "director": the director if printed or if you are sure of it, else null.
- "format": "dvd", "bluray" or "uhd_bluray", judged from the logos and case (DVD logo; "Blu-ray Disc" logo or blue case; "4K Ultra HD" logo or black case). null if you can't tell.
- "edition": a special edition printed on the case ("Steelbook", "Collector's Edition", "Director's Cut"…), else null.
- "confidence": "high", "medium" or "low". Use "low" when partially hidden, blurry or guessed.
- "box_2d": the bounding box of the FRONT COVER as [ymin, xmin, ymax, xmax] normalized to 0-1000, or null if only the spine is visible.

Skip anything you cannot read at all — do not invent titles. A box set counts as one item.

Respond with ONLY a JSON array (no markdown, no explanation):
[{"title": "...", "original_title": null, "year": 1982, "director": "...", "format": "bluray", "edition": null, "confidence": "high", "box_2d": [0, 0, 1000, 1000]}]`;

function optionalString(value: unknown, max = 500): string | null {
	return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function toYear(value: unknown): number | null {
	const year = typeof value === 'string' ? Number(value) : value;
	return typeof year === 'number' && Number.isInteger(year) && year >= 1880 && year <= 2999
		? year
		: null;
}

/** Best-effort: cualquier fallo devuelve []. */
export async function identifyMoviesFromImage(
	apiKey: string,
	imageDataUrl: string,
	log?: AiLogContext
): Promise<MovieCandidate[]> {
	const candidates = await askVisionModel(apiKey, PROMPT, imageDataUrl, {
		label: 'identifyMoviesFromImage',
		log,
		toResults: toCandidates
	});
	return candidates ?? [];
}

function toCandidates(items: unknown[]): MovieCandidate[] {
	const candidates: MovieCandidate[] = [];
	for (const item of items) {
		if (typeof item !== 'object' || item === null) continue;
		const c = item as Record<string, unknown>;
		const title = optionalString(c.title);
		if (!title) continue;
		candidates.push({
			title,
			originalTitle: optionalString(c.original_title),
			releaseYear: toYear(c.year),
			director: optionalString(c.director, 200),
			format: isMediaFormat(c.format) ? c.format : null,
			edition: optionalString(c.edition, 200),
			confidence: toConfidence(c.confidence),
			box: toBox(c.box_2d)
		});
		if (candidates.length >= MAX_CANDIDATES) break;
	}
	return candidates;
}

// ─── Casar con TMDB ───────────────────────────────────────────────────────────

export interface ScannedMovie extends MovieCandidate {
	/** Mejores coincidencias en TMDB, la primera es la propuesta. Vacío si ninguna. */
	matches: MovieSearchResult[];
}

/**
 * Busca cada candidato en TMDB: primero título + año; si no sale nada, sin el
 * año (el de la edición en disco puede no ser el del estreno) y por último
 * por el título original.
 */
export async function matchWithTmdb(candidate: MovieCandidate): Promise<MovieSearchResult[]> {
	const attempts: [string, number | undefined][] = [];
	if (candidate.releaseYear) attempts.push([candidate.title, candidate.releaseYear]);
	attempts.push([candidate.title, undefined]);
	if (candidate.originalTitle) {
		attempts.push([candidate.originalTitle, candidate.releaseYear ?? undefined]);
	}

	for (const [query, year] of attempts) {
		const results = await searchMovies(query, year, MAX_MATCHES).catch(() => []);
		if (results.length > 0) return results;
	}
	return [];
}

export async function scanMovies(
	apiKey: string,
	imageDataUrl: string,
	log?: AiLogContext
): Promise<ScannedMovie[]> {
	const candidates = await identifyMoviesFromImage(apiKey, imageDataUrl, log);
	return Promise.all(candidates.map(async (c) => ({ ...c, matches: await matchWithTmdb(c) })));
}
