// Textos del registro de consumo de IA (/account/ai-usage). Las claves son las
// del enum ai_call_kind (src/lib/server/db/schema.ts).

export const AI_KIND_LABELS: Record<string, string> = {
	book_shelf_scan: 'Foto de estantería',
	movie_scan: 'Foto de carátulas',
	book_tags: 'Etiquetas de libro',
	movie_tags: 'Etiquetas de película',
	book_cover_search: 'Búsqueda de portada',
	book_cover_scan: 'Foto de portada',
	book_cover_compare: 'Comparación de portadas'
};

// Qué cuenta resultCount en cada tipo
export function resultLabel(kind: string, n: number): string {
	const one = n === 1;
	switch (kind) {
		case 'book_shelf_scan':
			return `${n} ${one ? 'libro reconocido' : 'libros reconocidos'}`;
		case 'movie_scan':
			return `${n} ${one ? 'película reconocida' : 'películas reconocidas'}`;
		case 'book_tags':
		case 'movie_tags':
			return `${n} ${one ? 'etiqueta sugerida' : 'etiquetas sugeridas'}`;
		case 'book_cover_search':
			return `${n} ${one ? 'pista' : 'pistas'} de portada`;
		case 'book_cover_scan':
			return `${n} ${one ? 'libro reconocido' : 'libros reconocidos'}`;
		case 'book_cover_compare':
			return `${n} ${one ? 'candidata comparada' : 'candidatas comparadas'}`;
		default:
			return String(n);
	}
}

// Los errores que registra openRouterChat, explicados
export function errorLabel(error: string | null): string {
	switch (error) {
		case 'HTTP 401':
			return 'Clave de OpenRouter no válida';
		case 'HTTP 402':
			return 'Sin saldo en OpenRouter';
		case 'HTTP 429':
			return 'Demasiadas peticiones';
		case 'timeout':
			return 'Tardó demasiado';
		case 'network error':
			return 'Error de conexión';
		case 'invalid response':
			return 'Respuesta que no se pudo usar';
		default:
			return error ?? 'Error';
	}
}

const usd = new Intl.NumberFormat('es-ES', {
	style: 'currency',
	currency: 'USD',
	minimumFractionDigits: 2,
	maximumFractionDigits: 4
});

/** Coste en dólares; las llamadas sueltas cuestan fracciones de céntimo. */
export function formatUsd(value: number | null): string {
	if (value === null) return '—';
	if (value > 0 && value < 0.0001) return `< ${usd.format(0.0001)}`;
	return usd.format(value);
}
