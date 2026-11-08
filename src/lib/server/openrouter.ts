// Llamada única a OpenRouter (chat completions, OpenAI-compatible) con la
// clave del usuario. La usan todas las funciones de IA de la app: escaneo de
// estanterías y carátulas, etiquetas sugeridas y búsqueda de portadas.
//
// Además de la llamada, registra cada una en ai_usage_log (aiUsage.ts) con lo
// que OpenRouter informa en la respuesta: coste real, tokens y modelo. Así
// ninguna función de IA puede olvidarse de apuntar su consumo.
import { env } from '$env/dynamic/private';
// Solo el tipo: aiUsage.ts arrastra la conexión a la base de datos, que exige
// DATABASE_URL al cargarse. Se importa al registrar (ver finish) para que estas
// funciones no dependan de la base solo por importarlas (tests, CI).
import type { AiLogContext } from './aiUsage';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export type ChatMessage = {
	content?: string | null;
	annotations?: { url_citation?: { url?: unknown } }[];
};

export interface ChatRequest {
	model: string;
	max_tokens: number;
	messages: unknown[];
	plugins?: unknown[];
}

export interface ChatOptions<T> {
	/** Prefijo para los console.error */
	label: string;
	timeoutMs: number;
	/** Sin contexto (p.ej. en tests) no se registra nada */
	log?: AiLogContext;
	/**
	 * Interpreta la respuesta. Si lanza, la llamada cuenta como fallida
	 * («invalid response»). resultCount es lo que se apunta en el registro.
	 */
	parse: (message: ChatMessage) => { value: T; resultCount: number };
}

type Usage = {
	model: string | null;
	generationId: string | null;
	promptTokens: number | null;
	completionTokens: number | null;
	costUsd: number | null;
};

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// OpenRouter incluye usage en todas las respuestas; cost en dólares (créditos).
export function extractUsage(data: unknown): Usage {
	const d = (data ?? {}) as {
		id?: unknown;
		model?: unknown;
		usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; cost?: unknown };
	};
	return {
		model: typeof d.model === 'string' ? d.model : null,
		generationId: typeof d.id === 'string' ? d.id : null,
		promptTokens: num(d.usage?.prompt_tokens),
		completionTokens: num(d.usage?.completion_tokens),
		costUsd: num(d.usage?.cost)
	};
}

/**
 * Best-effort: cualquier fallo (red, timeout, HTTP, respuesta que `parse` no
 * entiende) devuelve null en vez de lanzar, y queda registrado como fallido.
 */
export async function openRouterChat<T>(
	apiKey: string,
	request: ChatRequest,
	options: ChatOptions<T>
): Promise<T | null> {
	const { label, timeoutMs, log, parse } = options;
	const started = Date.now();
	let usage: Usage = {
		model: request.model,
		generationId: null,
		promptTokens: null,
		completionTokens: null,
		costUsd: null
	};

	const finish = async (outcome: { resultCount?: number; error?: string }) => {
		if (!log) return;
		const { recordAiCall } = await import('./aiUsage');
		await recordAiCall(log, {
			...usage,
			success: !outcome.error,
			error: outcome.error ?? null,
			resultCount: outcome.resultCount ?? null,
			durationMs: Date.now() - started
		});
	};

	try {
		const res = await fetch(OPENROUTER_URL, {
			method: 'POST',
			signal: AbortSignal.timeout(timeoutMs),
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': env.ORIGIN ?? 'https://librarian.scholio.review',
				'X-Title': 'Librarian'
			},
			body: JSON.stringify(request)
		});

		if (!res.ok) {
			const body = await res.text().catch(() => '');
			console.error(`${label}: OpenRouter ${res.status}`, body.slice(0, 1000));
			await finish({ error: `HTTP ${res.status}` });
			return null;
		}

		const data = await res.json();
		const reported = extractUsage(data);
		usage = { ...reported, model: reported.model ?? request.model };
		const message: ChatMessage = data?.choices?.[0]?.message ?? {};

		let parsed: { value: T; resultCount: number };
		try {
			parsed = parse(message);
		} catch (parseErr) {
			console.error(`${label}: could not use model output`, {
				error: parseErr,
				content: String(message.content ?? '').slice(0, 1000)
			});
			await finish({ error: 'invalid response' });
			return null;
		}

		await finish({ resultCount: parsed.resultCount });
		return parsed.value;
	} catch (err) {
		const timedOut = err instanceof DOMException && err.name === 'TimeoutError';
		console.error(`${label}: ${timedOut ? 'timeout' : 'unexpected failure'}`, err);
		await finish({ error: timedOut ? 'timeout' : 'network error' });
		return null;
	}
}
