import type { AuthorSearchResult } from '$lib/types';

// Lógica pura de la búsqueda de autores: filtra los autores de la biblioteca
// del usuario y los combina con las sugerencias de OpenLibrary. Sin acceso a
// BD para poder testearla sin Postgres.

function normalize(s: string): string {
	return s
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim();
}

// Cada palabra de la consulta debe aparecer en el nombre (sin tildes ni
// mayúsculas), así "marquez garcia" también encuentra "Gabriel García Márquez".
export function matchLocalAuthors(
	authorLists: (string[] | null)[],
	query: string,
	limit = 5
): AuthorSearchResult[] {
	const terms = normalize(query).split(/\s+/).filter(Boolean);
	if (terms.length === 0) return [];

	// Agrupa por nombre normalizado; se queda con la grafía más frecuente
	const byKey = new Map<string, { spellings: Map<string, number>; count: number }>();
	for (const authors of authorLists) {
		for (const name of new Set(authors ?? [])) {
			const trimmed = name.trim();
			if (!trimmed) continue;
			const key = normalize(trimmed);
			if (!terms.every((t) => key.includes(t))) continue;
			const entry = byKey.get(key) ?? { spellings: new Map(), count: 0 };
			entry.count++;
			entry.spellings.set(trimmed, (entry.spellings.get(trimmed) ?? 0) + 1);
			byKey.set(key, entry);
		}
	}

	return [...byKey.entries()]
		.map(([key, { spellings, count }]) => ({
			id: `local:${key}`,
			name: [...spellings.entries()].sort((a, b) => b[1] - a[1])[0][0],
			birthDate: null,
			deathDate: null,
			topWork: null,
			workCount: count,
			source: 'local' as const
		}))
		.sort((a, b) => b.workCount - a.workCount || a.name.localeCompare(b.name))
		.slice(0, limit);
}

// Los autores locales van primero; de OpenLibrary se descartan los que ya
// aparecen (mismo nombre normalizado) para no mostrarlos dos veces.
export function mergeAuthorResults(
	local: AuthorSearchResult[],
	remote: AuthorSearchResult[]
): AuthorSearchResult[] {
	const seen = new Set(local.map((a) => normalize(a.name)));
	return [...local, ...remote.filter((a) => !seen.has(normalize(a.name)))];
}
