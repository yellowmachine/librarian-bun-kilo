// Busca URLs públicas de portada para un libro dado de alta a mano (no está en
// OpenLibrary, así que no hay cover_i que usar).
//
// Los modelos de lenguaje se inventan URLs de imágenes con facilidad, así que
// la IA aquí nunca es la fuente final de verdad: solo aporta *pistas* (ISBNs
// de ediciones, páginas de editorial/librería encontradas por búsqueda web, y
// como mucho alguna URL de imagen directa), y TODA URL candidata se descarga
// desde el servidor para comprobar que de verdad es una imagen antes de
// ofrecérsela al usuario, que es quien elige la definitiva.
//
// Fuentes, en paralelo:
//   1. OpenLibrary por ISBN (si el usuario lo escribió) — gratis, sin IA.
//   2. Google Books por ISBN o título+autor — gratis, sin IA.
//   3. OpenRouter con búsqueda web (si el usuario tiene clave en Scholio):
//      ISBNs → OpenLibrary, páginas → og:image, URLs directas.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { env } from '$env/dynamic/private';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Mismo modelo barato que el escaneo de estanterías; la búsqueda web la hace
// el plugin "web" de OpenRouter (Exa, ~0.007 $/petición), no el modelo.
const COVER_MODEL = 'google/gemini-2.5-flash-lite';
const AI_TIMEOUT_MS = 45_000;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_HTML_BYTES = 1024 * 1024;
// Por debajo de esto son placeholders (el 1x1 de OpenLibrary, iconos, etc.).
const MIN_IMAGE_BYTES = 2_000;
const MAX_CANDIDATES = 6;
const MAX_PAGES_TO_SCRAPE = 5;
const USER_AGENT = 'Librarian/1.0 (+https://librarian.scholio.review)';

export interface CoverQuery {
	title: string;
	authors: string[];
	isbn?: string;
	publishYear?: number;
}

export interface CoverSearchResult {
	candidates: string[];
	usedAi: boolean;
}

// ─── Protección SSRF ──────────────────────────────────────────────────────────
// Las URLs vienen de un LLM y de páginas de terceros, así que antes de pedir
// nada se exige https y que el host no resuelva a una red privada/local.

export function isPrivateAddress(ip: string): boolean {
	if (isIP(ip) === 6) {
		const lower = ip.toLowerCase();
		const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
		if (mapped) return isPrivateAddress(mapped[1]);
		return (
			lower === '::' ||
			lower === '::1' ||
			lower.startsWith('fc') ||
			lower.startsWith('fd') ||
			lower.startsWith('fe8') ||
			lower.startsWith('fe9') ||
			lower.startsWith('fea') ||
			lower.startsWith('feb')
		);
	}
	const parts = ip.split('.').map(Number);
	if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
	const [a, b] = parts;
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		a >= 224
	);
}

async function isSafePublicUrl(raw: string): Promise<URL | null> {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' || url.username || url.password) return null;
	if (url.port && url.port !== '443') return null;

	const host = url.hostname.replace(/^\[|\]$/g, '');
	if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
		return null;
	}
	if (isIP(host)) return isPrivateAddress(host) ? null : url;

	try {
		const addrs = await lookup(host, { all: true });
		if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) return null;
	} catch {
		return null;
	}
	return url;
}

// fetch con redirecciones manuales para re-validar cada salto.
async function safeFetch(raw: string, accept: string): Promise<Response | null> {
	let current = raw;
	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		const url = await isSafePublicUrl(current);
		if (!url) return null;
		let res: Response;
		try {
			res = await fetch(url, {
				redirect: 'manual',
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
				headers: { 'User-Agent': USER_AGENT, Accept: accept }
			});
		} catch {
			return null;
		}
		if (res.status >= 300 && res.status < 400) {
			const location = res.headers.get('location');
			await res.body?.cancel().catch(() => {});
			if (!location) return null;
			current = new URL(location, url).toString();
			continue;
		}
		return res;
	}
	return null;
}

// Lee el cuerpo hasta `limit` bytes; null si se pasa (no queremos descargar
// un fichero enorme solo para validarlo).
async function readLimited(res: Response, limit: number): Promise<Uint8Array | null> {
	if (!res.body) return null;
	const declared = Number(res.headers.get('content-length'));
	if (declared && declared > limit) {
		await res.body.cancel().catch(() => {});
		return null;
	}
	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > limit) {
				await reader.cancel().catch(() => {});
				return null;
			}
			chunks.push(value);
		}
	} catch {
		return null;
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		out.set(c, offset);
		offset += c.byteLength;
	}
	return out;
}

/** true si la URL sirve de verdad una imagen pública con un tamaño razonable. */
export async function isUsableImage(url: string): Promise<boolean> {
	const res = await safeFetch(url, 'image/*');
	if (!res) return false;
	if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) {
		await res.body?.cancel().catch(() => {});
		return false;
	}
	const body = await readLimited(res, MAX_IMAGE_BYTES);
	return body !== null && body.byteLength >= MIN_IMAGE_BYTES;
}

// ─── Fuentes sin IA ───────────────────────────────────────────────────────────

function normalizeIsbn(isbn: string): string | null {
	const clean = isbn.replace(/[^0-9Xx]/g, '').toUpperCase();
	return /^(?:\d{9}[\dX]|\d{13})$/.test(clean) ? clean : null;
}

function openLibraryIsbnCover(isbn: string): string {
	// default=false → 404 en vez del placeholder transparente si no hay portada.
	return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`;
}

export function normalizeGoogleThumbnail(url: string): string {
	return url
		.replace(/^http:\/\//, 'https://')
		.replace(/&edge=curl/g, '')
		.replace(/&source=gbs_api/g, '');
}

async function googleBooksCovers(query: CoverQuery, isbn: string | null): Promise<string[]> {
	const q = isbn
		? `isbn:${isbn}`
		: [`intitle:${query.title}`, query.authors[0] ? `inauthor:${query.authors[0]}` : '']
				.filter(Boolean)
				.join('+');
	// Sin clave se comparte la cuota anónima de Google, que suele estar agotada
	// (429) — en ese caso esta fuente simplemente no aporta nada.
	const keyParam = env.GOOGLE_BOOKS_API_KEY
		? `&key=${encodeURIComponent(env.GOOGLE_BOOKS_API_KEY)}`
		: '';
	try {
		const res = await fetch(
			`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5${keyParam}`,
			{ signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
		);
		if (!res.ok) return [];
		const data = await res.json();
		const items: { volumeInfo?: { imageLinks?: { thumbnail?: string } } }[] = data.items ?? [];
		return items
			.map((i) => i.volumeInfo?.imageLinks?.thumbnail)
			.filter((u): u is string => typeof u === 'string')
			.map(normalizeGoogleThumbnail);
	} catch {
		return [];
	}
}

// ─── og:image de páginas de editorial / librería ──────────────────────────────

export function extractOgImage(html: string, pageUrl: string): string | null {
	const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
	for (const key of ['og:image:secure_url', 'og:image', 'twitter:image']) {
		for (const tag of metas) {
			const name = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1];
			if (name?.toLowerCase() !== key) continue;
			const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];
			if (!content) continue;
			try {
				return new URL(content.replace(/&amp;/g, '&'), pageUrl).toString();
			} catch {
				continue;
			}
		}
	}
	return null;
}

async function ogImageFromPage(pageUrl: string): Promise<string | null> {
	const res = await safeFetch(pageUrl, 'text/html');
	if (!res) return null;
	if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) {
		await res.body?.cancel().catch(() => {});
		return null;
	}
	const body = await readLimited(res, MAX_HTML_BYTES);
	if (!body) return null;
	return extractOgImage(new TextDecoder().decode(body), pageUrl);
}

// ─── IA (OpenRouter + búsqueda web) ───────────────────────────────────────────

interface AiCoverHints {
	isbns: string[];
	pageUrls: string[];
	imageUrls: string[];
}

function buildPrompt(q: CoverQuery): string {
	const lines = [
		`Title: ${q.title}`,
		q.authors.length > 0 ? `Author(s): ${q.authors.join(', ')}` : null,
		q.publishYear ? `Year: ${q.publishYear}` : null,
		q.isbn ? `ISBN given by the user: ${q.isbn}` : null
	].filter(Boolean);

	return `I need a picture of the front cover of this book, to show in a personal library catalogue:

${lines.join('\n')}

Using the web search results, find:
- "isbns": ISBN-10 or ISBN-13 numbers of editions of THIS book (prefer the edition matching the year/language given).
- "pageUrls": URLs of web pages dedicated to THIS specific book (publisher catalogue page, bookstore product page, Goodreads, library record...). Not search pages, not author pages.
- "imageUrls": direct URLs of the cover image file, only if you actually saw them in the results. Never guess or construct an image URL.

Leave a list empty rather than including anything about a different book.

Respond with ONLY a JSON object (no markdown, no explanation):
{"isbns": ["..."], "pageUrls": ["..."], "imageUrls": ["..."]}`;
}

function extractJson(content: string): string {
	const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
	return (fenced ? fenced[1] : content).trim();
}

function stringList(value: unknown, max: number): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
		.map((v) => v.trim())
		.slice(0, max);
}

/** Best-effort: cualquier fallo devuelve pistas vacías en vez de lanzar. */
export async function askAiForCoverHints(apiKey: string, query: CoverQuery): Promise<AiCoverHints> {
	const empty: AiCoverHints = { isbns: [], pageUrls: [], imageUrls: [] };
	try {
		const res = await fetch(OPENROUTER_URL, {
			method: 'POST',
			signal: AbortSignal.timeout(AI_TIMEOUT_MS),
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': 'https://librarian.scholio.review',
				'X-Title': 'Librarian'
			},
			body: JSON.stringify({
				model: COVER_MODEL,
				max_tokens: 1024,
				plugins: [{ id: 'web', engine: 'exa', max_results: 5 }],
				messages: [{ role: 'user', content: buildPrompt(query) }]
			})
		});

		if (!res.ok) {
			const body = await res.text().catch(() => '');
			console.error(`askAiForCoverHints: OpenRouter ${res.status}`, body.slice(0, 1000));
			return empty;
		}

		const data = await res.json();
		const message = data.choices?.[0]?.message;
		const content: string | undefined = message?.content;

		// Las fuentes que citó la búsqueda web también son páginas candidatas,
		// aunque el modelo no las haya copiado en pageUrls.
		const citedPages: string[] = (message?.annotations ?? [])
			.map((a: { url_citation?: { url?: unknown } }) => a.url_citation?.url)
			.filter((u: unknown): u is string => typeof u === 'string');

		let parsed: Record<string, unknown> = {};
		if (content) {
			try {
				const value = JSON.parse(extractJson(content));
				if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value;
			} catch {
				console.error('askAiForCoverHints: could not parse model output', content.slice(0, 1000));
			}
		}

		return {
			isbns: stringList(parsed.isbns, 6),
			pageUrls: [...new Set([...stringList(parsed.pageUrls, 6), ...citedPages])],
			imageUrls: stringList(parsed.imageUrls, 6)
		};
	} catch (err) {
		console.error('askAiForCoverHints: unexpected failure', err);
		return empty;
	}
}

// ─── Orquestación ─────────────────────────────────────────────────────────────

async function keepUsable(urls: string[]): Promise<string[]> {
	const unique = [...new Set(urls)];
	const checks = await Promise.all(unique.map(async (u) => ((await isUsableImage(u)) ? u : null)));
	return checks.filter((u): u is string => u !== null);
}

export async function findCoverCandidates(
	query: CoverQuery,
	apiKey: string | null
): Promise<CoverSearchResult> {
	const userIsbn = query.isbn ? normalizeIsbn(query.isbn) : null;

	const [googleUrls, hints] = await Promise.all([
		googleBooksCovers(query, userIsbn),
		apiKey ? askAiForCoverHints(apiKey, query) : Promise.resolve(null)
	]);

	const aiIsbns = (hints?.isbns ?? []).map(normalizeIsbn).filter((i): i is string => i !== null);
	const pageImages = hints
		? await Promise.all(hints.pageUrls.slice(0, MAX_PAGES_TO_SCRAPE).map(ogImageFromPage))
		: [];

	// Orden = prioridad: lo que viene del ISBN del usuario es lo más fiable.
	const raw = [
		...(userIsbn ? [openLibraryIsbnCover(userIsbn)] : []),
		...googleUrls,
		...aiIsbns.map(openLibraryIsbnCover),
		...pageImages.filter((u): u is string => u !== null),
		...(hints?.imageUrls ?? [])
	];

	const verified = await keepUsable(raw);
	// Ya sabemos que existe: se guarda sin ?default=false para que BookCard
	// pueda seguir cambiando -M.jpg por -L.jpg al ampliarla.
	const candidates = [...new Set(verified.map((u) => u.replace(/\?default=false$/, '')))];
	return { candidates: candidates.slice(0, MAX_CANDIDATES), usedAi: hints !== null };
}
