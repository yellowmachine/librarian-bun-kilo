// Identifica libros por el lomo en una foto de estantería, vía OpenRouter
// con la clave del usuario (https://openrouter.ai/api/v1/chat/completions,
// OpenAI-compatible).

import { openRouterChat } from './openrouter';
import type { AiLogContext } from './aiUsage';
// Confirmado contra https://openrouter.ai/api/v1/models (sin auth) que este
// id existe hoy y soporta input de imagen — los ids de modelo de OpenRouter
// se retiran/renombran con el tiempo, así que si esto vuelve a fallar,
// comprobar el catálogo actual antes de asumir que es un problema de la foto.
const VISION_MODEL = 'google/gemini-2.5-flash-lite';
const VISION_TIMEOUT_MS = 30_000;

export interface ShelfBookCandidate {
	title: string;
	author: string | null;
	confidence: 'high' | 'medium' | 'low';
	tags: string[];
}

const BASE_PROMPT = `You are looking at a photo of a bookshelf. Identify every book you can from its spine — title and, if legible, the author.

Use "low" confidence for spines that are partially obscured, blurry, or where you're guessing. Skip anything you cannot read at all — do not invent titles.`;

// Solo se añade este bloque cuando el usuario ya tiene tags creados — no
// tiene sentido pedir el campo si no hay nada entre lo que elegir.
function buildTagsInstructions(availableTagNames: string[]): string {
	if (availableTagNames.length === 0) return '';
	const list = availableTagNames.map((t) => `"${t}"`).join(', ');
	return `\n\nThe user has these existing tags: [${list}]. For each book, also include a "tags" array with any of these EXACT names that fit its subject or genre, based on your own knowledge of the book — zero, one, or several. Only use names from this exact list, never invent a new tag name. If none fit, use an empty array.`;
}

function buildPrompt(availableTagNames: string[]): string {
	const tagsBlock = buildTagsInstructions(availableTagNames);
	const tagsField = availableTagNames.length > 0 ? ', "tags": ["..."]' : '';
	return `${BASE_PROMPT}${tagsBlock}

Respond with ONLY a JSON array (no markdown, no explanation), one object per book:
[{"title": "...", "author": "..." or null, "confidence": "high" | "medium" | "low"${tagsField}}]`;
}

export function toConfidence(value: unknown): ShelfBookCandidate['confidence'] {
	return value === 'high' || value === 'medium' || value === 'low' ? value : 'medium';
}

// Solo se aceptan nombres que coincidan (sin distinguir mayúsculas) con un
// tag real del usuario — cualquier otra cosa que el modelo devuelva se
// descarta, así nunca puede "inventar" un tag nuevo por esta vía.
export function filterKnownTags(value: unknown, availableTagNames: string[]): string[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const result: string[] = [];
	for (const raw of value) {
		if (typeof raw !== 'string') continue;
		const trimmed = raw.trim();
		const match = availableTagNames.find((t) => t.toLowerCase() === trimmed.toLowerCase());
		if (match && !seen.has(match)) {
			seen.add(match);
			result.push(match);
		}
	}
	return result;
}

export function extractJson(content: string): string {
	const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
	return (fenced ? fenced[1] : content).trim();
}

/**
 * Manda una foto y un prompt al modelo de visión, que debe responder con un
 * array JSON; `toResults` lo convierte en resultados (descartando lo que no
 * valga). Devuelve null si algo falla (red, HTTP, respuesta vacía, JSON
 * inválido o que no es un array); nunca lanza. Queda registrado en el consumo
 * de IA del usuario si se pasa `log`. Lo usan el escaneo de estanterías y el
 * de carátulas (movieVision.ts).
 */
export async function askVisionModel<T>(
	apiKey: string,
	prompt: string,
	imageDataUrl: string,
	options: { label: string; log?: AiLogContext; toResults: (items: unknown[]) => T[] }
): Promise<T[] | null> {
	return openRouterChat<T[]>(
		apiKey,
		{
			model: VISION_MODEL,
			max_tokens: 4096,
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: prompt },
						{ type: 'image_url', image_url: { url: imageDataUrl } }
					]
				}
			]
		},
		{
			label: options.label,
			timeoutMs: VISION_TIMEOUT_MS,
			log: options.log,
			parse: (message) => {
				if (!message.content) throw new Error('empty content');
				const parsed: unknown = JSON.parse(extractJson(message.content));
				if (!Array.isArray(parsed)) throw new Error('model output is not an array');
				const results = options.toResults(parsed);
				return { value: results, resultCount: results.length };
			}
		}
	);
}

/**
 * Best-effort: cualquier fallo (red, parseo, respuesta vacía) devuelve una
 * lista vacía en vez de lanzar — un fallo aquí no debe romper el flujo de
 * añadir libros, simplemente no habrá candidatos que revisar.
 */
export async function identifyBooksFromImage(
	apiKey: string,
	imageDataUrl: string,
	availableTagNames: string[] = [],
	log?: AiLogContext
): Promise<ShelfBookCandidate[]> {
	const candidates = await askVisionModel(apiKey, buildPrompt(availableTagNames), imageDataUrl, {
		label: 'identifyBooksFromImage',
		log,
		toResults: (items) =>
			items
				.filter(
					(c): c is { title: string; author?: unknown; confidence?: unknown; tags?: unknown } =>
						typeof c === 'object' &&
						c !== null &&
						typeof (c as { title?: unknown }).title === 'string' &&
						(c as { title: string }).title.trim().length > 0
				)
				.map((c) => ({
					title: c.title.trim(),
					author: typeof c.author === 'string' && c.author.trim() ? c.author.trim() : null,
					confidence: toConfidence(c.confidence),
					tags: filterKnownTags(c.tags, availableTagNames)
				}))
	});
	if (candidates?.length === 0) {
		console.error('identifyBooksFromImage: model returned zero valid candidates');
	}
	return candidates ?? [];
}
