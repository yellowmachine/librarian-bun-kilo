// Identifica libros por el lomo en una foto de estantería, vía OpenRouter
// (mismo endpoint/formato que ya usa Scholio para sus llamadas de IA:
// https://openrouter.ai/api/v1/chat/completions, OpenAI-compatible).

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
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
}

const PROMPT = `You are looking at a photo of a bookshelf. Identify every book you can from its spine — title and, if legible, the author.

Respond with ONLY a JSON array (no markdown, no explanation), one object per book:
[{"title": "...", "author": "..." or null, "confidence": "high" | "medium" | "low"}]

Use "low" confidence for spines that are partially obscured, blurry, or where you're guessing. Skip anything you cannot read at all — do not invent titles.`;

function toConfidence(value: unknown): ShelfBookCandidate['confidence'] {
	return value === 'high' || value === 'medium' || value === 'low' ? value : 'medium';
}

function extractJson(content: string): string {
	const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
	return (fenced ? fenced[1] : content).trim();
}

/**
 * Best-effort: cualquier fallo (red, parseo, respuesta vacía) devuelve una
 * lista vacía en vez de lanzar — un fallo aquí no debe romper el flujo de
 * añadir libros, simplemente no habrá candidatos que revisar.
 */
export async function identifyBooksFromImage(
	apiKey: string,
	imageDataUrl: string
): Promise<ShelfBookCandidate[]> {
	try {
		const res = await fetch(OPENROUTER_URL, {
			method: 'POST',
			signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': 'https://librarian.scholio.review',
				'X-Title': 'Librarian'
			},
			body: JSON.stringify({
				model: VISION_MODEL,
				max_tokens: 4096,
				messages: [
					{
						role: 'user',
						content: [
							{ type: 'text', text: PROMPT },
							{ type: 'image_url', image_url: { url: imageDataUrl } }
						]
					}
				]
			})
		});

		if (!res.ok) {
			const body = await res.text().catch(() => '');
			console.error(`identifyBooksFromImage: OpenRouter ${res.status}`, body.slice(0, 1000));
			return [];
		}

		const data = await res.json();
		const content: string | undefined = data.choices?.[0]?.message?.content;
		if (!content) {
			console.error(
				'identifyBooksFromImage: empty content in response',
				JSON.stringify(data).slice(0, 1000)
			);
			return [];
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(extractJson(content));
		} catch (parseErr) {
			console.error('identifyBooksFromImage: could not parse model output as JSON', {
				error: parseErr,
				content: content.slice(0, 1000)
			});
			return [];
		}
		if (!Array.isArray(parsed)) {
			console.error(
				'identifyBooksFromImage: parsed output is not an array',
				content.slice(0, 1000)
			);
			return [];
		}

		const candidates: ShelfBookCandidate[] = parsed
			.filter(
				(c): c is { title: unknown; author?: unknown; confidence?: unknown } =>
					c && typeof c.title === 'string' && c.title.trim().length > 0
			)
			.map((c) => ({
				title: (c.title as string).trim(),
				author: typeof c.author === 'string' && c.author.trim() ? c.author.trim() : null,
				confidence: toConfidence(c.confidence)
			}));

		if (candidates.length === 0) {
			console.error(
				'identifyBooksFromImage: model returned zero valid candidates',
				content.slice(0, 1000)
			);
		}

		return candidates;
	} catch (err) {
		console.error('identifyBooksFromImage: unexpected failure', err);
		return [];
	}
}
