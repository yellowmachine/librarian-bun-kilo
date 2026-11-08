// Servicio de integración con TMDB (The Movie Database), la fuente de la
// videoteca: búsqueda por título y ficha completa con pósters.
// Docs: https://developer.themoviedb.org/reference/intro/getting-started
//
// Necesita TMDB_API_KEY. Vale tanto el "API Read Access Token" (v4, un JWT
// que empieza por "eyJ", va en la cabecera Authorization) como la "API Key"
// (v3, va como ?api_key=). Sin clave, la búsqueda devuelve [] y la videoteca
// funciona solo con alta manual.
//
// Las condiciones de TMDB exigen atribución en la interfaz: su logo y el aviso
// "This product uses the TMDB API but is not endorsed or certified by TMDB".
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { MovieSearchResult } from '$lib/types';

const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_IMAGES = 'https://image.tmdb.org/t/p';
const TMDB_TIMEOUT_MS = 10_000;
// Los títulos y sinopsis se piden en castellano; TMDB cae al título original
// si no hay traducción, pero deja la sinopsis vacía (ver fetchMovie).
const LANGUAGE = 'es-ES';
const FALLBACK_LANGUAGE = 'en-US';

// ─── TMDB API response shapes ─────────────────────────────────────────────────

interface TmdbSearchMovie {
	id: number;
	title: string;
	original_title?: string;
	release_date?: string; // "1982-06-25" o ""
	poster_path?: string | null;
}

interface TmdbCrewMember {
	name: string;
	job: string;
}

interface TmdbMovieDetails {
	id: number;
	title: string;
	original_title?: string;
	release_date?: string;
	runtime?: number | null;
	genres?: { id: number; name: string }[];
	overview?: string;
	poster_path?: string | null;
	credits?: { crew?: TmdbCrewMember[] };
}

export interface TmdbMovie {
	id: string; // "tmdb-<id>"
	title: string;
	originalTitle: string | null;
	releaseYear: number | null;
	directors: string[];
	runtime: number | null;
	genres: string[];
	overview: string | null;
	posterUrl: string | null; // w500
	tmdbData: string; // JSON raw (sin credits)
}

// ─── Ids ──────────────────────────────────────────────────────────────────────

const ID_PREFIX = 'tmdb-';

export function toMovieId(tmdbId: number): string {
	return `${ID_PREFIX}${tmdbId}`;
}

/** "tmdb-78" → 78; null si no es un id de TMDB válido. */
export function parseMovieId(movieId: string): number | null {
	const match = movieId.match(/^tmdb-(\d{1,10})$/);
	return match ? Number(match[1]) : null;
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

export function isTmdbConfigured(): boolean {
	return Boolean(env.TMDB_API_KEY?.trim());
}

async function fetchTmdb(path: string, params: Record<string, string>): Promise<Response> {
	const key = env.TMDB_API_KEY?.trim() ?? '';
	const query = new URLSearchParams(params);
	const headers: Record<string, string> = { Accept: 'application/json' };
	if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
	else query.set('api_key', key);

	try {
		return await fetch(`${TMDB_API}${path}?${query}`, {
			signal: AbortSignal.timeout(TMDB_TIMEOUT_MS),
			headers
		});
	} catch (e) {
		if (e instanceof DOMException && e.name === 'TimeoutError') {
			error(504, 'TMDB timed out');
		}
		throw e;
	}
}

function yearOf(date: string | undefined): number | null {
	const year = Number(date?.slice(0, 4));
	return Number.isInteger(year) && year > 0 ? year : null;
}

function imageUrl(path: string | null | undefined, size: 'w185' | 'w500'): string | null {
	return path ? `${TMDB_IMAGES}/${size}${path}` : null;
}

// Solo se guarda el original si difiere: "Blade Runner" no necesita repetirse.
function distinctOriginal(title: string, original: string | undefined): string | null {
	const trimmed = original?.trim();
	return trimmed && trimmed !== title ? trimmed : null;
}

// ─── Caché de fichas ──────────────────────────────────────────────────────────
// El alta (POST /api/movies) vuelve a pedir la ficha que el cliente acaba de
// elegir. Se guarda la promesa para que dos consultas simultáneas compartan
// la misma petición. Mismo esquema que la caché de openlibrary.ts.

const LOOKUP_TTL_MS = 15 * 60_000;
const LOOKUP_MAX_ENTRIES = 500;

const movieCache = new Map<number, { expires: number; value: Promise<TmdbMovie | null> }>();

/** Solo para tests. */
export function clearMovieCache(): void {
	movieCache.clear();
}

// ─── Buscar por título ────────────────────────────────────────────────────────

export async function searchMovies(
	query: string,
	year?: number,
	limit = 10
): Promise<MovieSearchResult[]> {
	if (!isTmdbConfigured() || !query.trim()) return [];

	const params: Record<string, string> = {
		query: query.trim(),
		language: LANGUAGE,
		include_adult: 'false'
	};
	if (year) params.year = String(year);

	const res = await fetchTmdb('/search/movie', params);
	if (!res.ok) return [];

	const data = (await res.json()) as { results?: TmdbSearchMovie[] };
	return (data.results ?? []).slice(0, limit).map((m) => ({
		id: toMovieId(m.id),
		title: m.title,
		originalTitle: distinctOriginal(m.title, m.original_title),
		releaseYear: yearOf(m.release_date),
		posterUrl: imageUrl(m.poster_path, 'w185')
	}));
}

// ─── Ficha completa ───────────────────────────────────────────────────────────

export function getMovie(tmdbId: number): Promise<TmdbMovie | null> {
	const now = Date.now();
	const hit = movieCache.get(tmdbId);
	if (hit && hit.expires > now) return hit.value;
	movieCache.delete(tmdbId);

	const value = fetchMovie(tmdbId).then(
		(movie) => {
			// No cachear "no encontrado": puede ser un fallo puntual de TMDB.
			if (!movie && movieCache.get(tmdbId)?.value === value) movieCache.delete(tmdbId);
			return movie;
		},
		(e) => {
			if (movieCache.get(tmdbId)?.value === value) movieCache.delete(tmdbId);
			throw e;
		}
	);

	if (movieCache.size >= LOOKUP_MAX_ENTRIES) {
		const oldest = movieCache.keys().next().value;
		if (oldest !== undefined) movieCache.delete(oldest);
	}
	movieCache.set(tmdbId, { expires: now + LOOKUP_TTL_MS, value });
	return value;
}

async function fetchMovie(tmdbId: number): Promise<TmdbMovie | null> {
	if (!isTmdbConfigured()) return null;

	const res = await fetchTmdb(`/movie/${tmdbId}`, {
		language: LANGUAGE,
		append_to_response: 'credits'
	});
	if (!res.ok) return null;

	const details = (await res.json()) as TmdbMovieDetails;
	let overview = details.overview?.trim() || null;

	// Sin sinopsis en castellano: se intenta la inglesa. Best-effort.
	if (!overview) {
		const fallback = await fetchTmdb(`/movie/${tmdbId}`, { language: FALLBACK_LANGUAGE }).catch(
			() => null
		);
		if (fallback?.ok) {
			const en = (await fallback.json()) as TmdbMovieDetails;
			overview = en.overview?.trim() || null;
		}
	}

	const directors = [
		...new Set((details.credits?.crew ?? []).filter((c) => c.job === 'Director').map((c) => c.name))
	];

	// El reparto completo (credits) puede ocupar cientos de KB: no se guarda.
	const { credits: _credits, ...raw } = details;

	return {
		id: toMovieId(details.id),
		title: details.title,
		originalTitle: distinctOriginal(details.title, details.original_title),
		releaseYear: yearOf(details.release_date),
		directors,
		runtime: details.runtime || null,
		genres: (details.genres ?? []).map((g) => g.name),
		overview,
		posterUrl: imageUrl(details.poster_path, 'w500'),
		tmdbData: JSON.stringify(raw)
	};
}
