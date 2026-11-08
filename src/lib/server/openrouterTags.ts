// Sugiere tags para un libro — de entre los que el usuario YA tiene, y además
// unos pocos nuevos que merecería crear — vía OpenRouter con la clave del
// usuario, mismo endpoint/modelo que el escaneo de estanterías
// (openrouterVision.ts).
import { extractJson, filterKnownTags } from './openrouterVision';
import { openRouterChat } from './openrouter';
import type { AiLogContext } from './aiUsage';

const TAGS_MODEL = 'google/gemini-2.5-flash-lite';
const TAGS_TIMEOUT_MS = 20_000;
const MAX_DESCRIPTION_CHARS = 2000;
const MAX_SUBJECTS = 25;
const MAX_NEW_TAGS = 3;
const MAX_NEW_TAG_CHARS = 40;

export interface TagSuggestions {
	/** Nombres exactos de tags que el usuario ya tiene. */
	existing: string[];
	/** Tags nuevos propuestos (no coinciden con ninguno existente). */
	proposed: string[];
}

export interface TagSuggestionInput {
	/** 'movie': authors son los directores y subjects los géneros. Por defecto 'book'. */
	kind?: 'book' | 'movie';
	title: string;
	authors: string[];
	description?: string | null;
	subjects?: string[];
}

/** Materias (`subjects`) del JSON crudo de OpenLibrary, si las hay. */
export function subjectsFromOpenLibraryData(raw: string | null | undefined): string[] {
	if (!raw) return [];
	try {
		const data = JSON.parse(raw);
		return Array.isArray(data?.subjects)
			? data.subjects.filter((s: unknown): s is string => typeof s === 'string')
			: [];
	} catch {
		return [];
	}
}

// Las etiquetas son las mismas para libros y películas: el prompt solo cambia
// cómo se describe la obra.
const WORDING = {
	book: {
		item: 'book',
		items: 'books',
		place: 'personal library',
		creators: 'Author(s)',
		subjects: 'Library subjects',
		notCreator: 'author'
	},
	movie: {
		item: 'movie',
		items: 'books and movies',
		place: 'home video collection',
		creators: 'Director(s)',
		subjects: 'Genres',
		notCreator: 'director'
	}
} as const;

function buildPrompt(book: TagSuggestionInput, availableTagNames: string[]): string {
	const w = WORDING[book.kind ?? 'book'];
	const lines = [
		`Title: ${book.title}`,
		book.authors.length > 0 ? `${w.creators}: ${book.authors.join(', ')}` : null,
		book.subjects?.length
			? `${w.subjects}: ${book.subjects.slice(0, MAX_SUBJECTS).join('; ')}`
			: null,
		book.description ? `Synopsis: ${book.description.slice(0, MAX_DESCRIPTION_CHARS)}` : null
	].filter(Boolean);
	const existing =
		availableTagNames.length > 0
			? `The user organizes their ${w.items} with these existing tags: [${availableTagNames.map((t) => `"${t}"`).join(', ')}].`
			: 'The user has no tags yet.';

	return `A user has this ${w.item} in their ${w.place}:

${lines.join('\n')}

${existing}

1. "existing": pick the tags from that list that fit this ${w.item}'s subject, genre or form — zero, one or several — using the information above and your own knowledge of the ${w.item}. Only use names from this exact list. Tags may be in a different language than the ${w.item}; match by meaning.
2. "new": suggest up to ${MAX_NEW_TAGS} NEW tags worth creating for this ${w.item}, only if they capture something important that no existing tag covers (genre, subject, form or audience). They must be short (1–3 words), general enough to apply to other ${w.items} too (never the title or ${w.notCreator}), and must not duplicate or be synonyms of existing tags. Write them in the same language and style as the existing tags (or in Spanish if there are none). If nothing important is missing, return an empty array.

Respond with ONLY a JSON object (no markdown, no explanation), e.g. {"existing": ["..."], "new": ["..."]}`;
}

/** Normaliza los tags nuevos propuestos: cortos, sin repetir y sin chocar con los existentes. */
export function filterNewTags(value: unknown, availableTagNames: string[]): string[] {
	if (!Array.isArray(value)) return [];
	const taken = new Set(availableTagNames.map((t) => t.toLowerCase()));
	const result: string[] = [];
	for (const raw of value) {
		if (typeof raw !== 'string') continue;
		const name = raw.trim().replace(/\s+/g, ' ');
		if (!name || name.length > MAX_NEW_TAG_CHARS || taken.has(name.toLowerCase())) continue;
		taken.add(name.toLowerCase());
		result.push(name);
		if (result.length === MAX_NEW_TAGS) break;
	}
	return result;
}

function parseSuggestions(content: string, availableTagNames: string[]): TagSuggestions {
	const parsed: unknown = JSON.parse(extractJson(content));
	// Por si el modelo responde solo con el array de existentes.
	if (Array.isArray(parsed)) {
		return { existing: filterKnownTags(parsed, availableTagNames), proposed: [] };
	}
	const obj = (parsed ?? {}) as { existing?: unknown; new?: unknown };
	return {
		existing: filterKnownTags(obj.existing, availableTagNames),
		proposed: filterNewTags(obj.new, availableTagNames)
	};
}

/**
 * Best-effort: cualquier fallo devuelve sugerencias vacías en vez de lanzar —
 * sugerir tags es un extra, nunca debe bloquear el alta.
 */
export async function suggestTagsForBook(
	apiKey: string,
	book: TagSuggestionInput,
	availableTagNames: string[],
	log?: AiLogContext
): Promise<TagSuggestions> {
	const suggestions = await openRouterChat<TagSuggestions>(
		apiKey,
		{
			model: TAGS_MODEL,
			max_tokens: 512,
			messages: [{ role: 'user', content: buildPrompt(book, availableTagNames) }]
		},
		{
			label: 'suggestTagsForBook',
			timeoutMs: TAGS_TIMEOUT_MS,
			log,
			parse: (message) => {
				if (!message.content) throw new Error('empty content');
				const value = parseSuggestions(message.content, availableTagNames);
				return { value, resultCount: value.existing.length + value.proposed.length };
			}
		}
	);
	return suggestions ?? { existing: [], proposed: [] };
}
