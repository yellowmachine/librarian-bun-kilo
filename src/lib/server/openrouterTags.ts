// Sugiere, entre los tags que el usuario YA tiene, cuáles encajan con un libro
// encontrado en OpenLibrary — vía OpenRouter con la clave de Scholio, mismo
// endpoint/modelo que el escaneo de estanterías (openrouterVision.ts).
import { extractJson, filterKnownTags } from './openrouterVision';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const TAGS_MODEL = 'google/gemini-2.5-flash-lite';
const TAGS_TIMEOUT_MS = 20_000;
const MAX_DESCRIPTION_CHARS = 2000;
const MAX_SUBJECTS = 25;

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
	const list = availableTagNames.map((t) => `"${t}"`).join(', ');

	return `A user is adding this book to their personal library:

${lines.join('\n')}

The user organizes their books with these existing tags: [${list}].

Pick the tags from that list that fit this book's subject, genre or form — zero, one or several — using the information above and your own knowledge of the book. Only use names from this exact list, never invent a new tag. Tags may be in a different language than the book; match by meaning. If none clearly fit, return an empty array.

Respond with ONLY a JSON array of tag names (no markdown, no explanation), e.g. ["...", "..."]`;
}

/**
 * Best-effort: cualquier fallo devuelve [] en vez de lanzar — sugerir tags es
 * un extra, nunca debe bloquear el alta.
 */
export async function suggestTagsForBook(
	apiKey: string,
	book: TagSuggestionInput,
	availableTagNames: string[]
): Promise<string[]> {
	if (availableTagNames.length === 0) return [];
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
			return [];
		}

		const data = await res.json();
		const content: string | undefined = data.choices?.[0]?.message?.content;
		if (!content) return [];

		try {
			return filterKnownTags(JSON.parse(extractJson(content)), availableTagNames);
		} catch {
			console.error('suggestTagsForBook: could not parse model output', content.slice(0, 1000));
			return [];
		}
	} catch (err) {
		console.error('suggestTagsForBook: unexpected failure', err);
		return [];
	}
}
