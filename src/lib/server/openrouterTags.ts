// Sugiere tags para un libro — de entre los que el usuario YA tiene, y además
// unos pocos nuevos que merecería crear — vía OpenRouter con la clave de
// Scholio, mismo endpoint/modelo que el escaneo de estanterías
// (openrouterVision.ts).
import { extractJson, filterKnownTags } from './openrouterVision';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
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

function buildPrompt(book: TagSuggestionInput, availableTagNames: string[]): string {
	const lines = [
		`Title: ${book.title}`,
		book.authors.length > 0 ? `Author(s): ${book.authors.join(', ')}` : null,
		book.subjects?.length
			? `Library subjects: ${book.subjects.slice(0, MAX_SUBJECTS).join('; ')}`
			: null,
		book.description ? `Synopsis: ${book.description.slice(0, MAX_DESCRIPTION_CHARS)}` : null
	].filter(Boolean);
	const existing =
		availableTagNames.length > 0
			? `The user organizes their books with these existing tags: [${availableTagNames.map((t) => `"${t}"`).join(', ')}].`
			: 'The user has no tags yet.';

	return `A user has this book in their personal library:

${lines.join('\n')}

${existing}

1. "existing": pick the tags from that list that fit this book's subject, genre or form — zero, one or several — using the information above and your own knowledge of the book. Only use names from this exact list. Tags may be in a different language than the book; match by meaning.
2. "new": suggest up to ${MAX_NEW_TAGS} NEW tags worth creating for this book, only if they capture something important that no existing tag covers (genre, subject, form or audience). They must be short (1–3 words), general enough to apply to other books too (never the title or author), and must not duplicate or be synonyms of existing tags. Write them in the same language and style as the existing tags (or in Spanish if there are none). If nothing important is missing, return an empty array.

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
	availableTagNames: string[]
): Promise<TagSuggestions> {
	const none: TagSuggestions = { existing: [], proposed: [] };
	try {
		const res = await fetch(OPENROUTER_URL, {
			method: 'POST',
			signal: AbortSignal.timeout(TAGS_TIMEOUT_MS),
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': 'https://librarian.scholio.review',
				'X-Title': 'Librarian'
			},
			body: JSON.stringify({
				model: TAGS_MODEL,
				max_tokens: 512,
				messages: [{ role: 'user', content: buildPrompt(book, availableTagNames) }]
			})
		});

		if (!res.ok) {
			const body = await res.text().catch(() => '');
			console.error(`suggestTagsForBook: OpenRouter ${res.status}`, body.slice(0, 1000));
			return none;
		}

		const data = await res.json();
		const content: string | undefined = data.choices?.[0]?.message?.content;
		if (!content) return none;

		try {
			return parseSuggestions(content, availableTagNames);
		} catch {
			console.error('suggestTagsForBook: could not parse model output', content.slice(0, 1000));
			return none;
		}
	} catch (err) {
		console.error('suggestTagsForBook: unexpected failure', err);
		return none;
	}
}
