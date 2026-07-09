// Traducción de títulos de libros vía Wikidata: misma entidad, etiquetas en
// distintos idiomas. Se usa como apoyo cuando OpenLibrary no encuentra un
// libro por su título en otro idioma (normalmente porque solo lo indexa en
// inglés). Best-effort: cualquier fallo devuelve null, nunca debe bloquear
// al llamador.
// Docs: https://www.wikidata.org/w/api.php

const WD_API = 'https://www.wikidata.org/w/api.php';
const WD_TIMEOUT_MS = 5_000;
const WD_USER_AGENT = 'Scholio/1.0 (miguel@scholio.review)';

// Tipos "obra escrita" — sesgamos a precisión: si el candidato no es
// claramente un libro/obra literaria, se descarta antes que arriesgar una
// traducción incorrecta (p.ej. "Fundación" == la ONG, no el libro).
const WRITTEN_WORK_TYPES = new Set([
	'Q571', // book
	'Q7725634', // literary work
	'Q47461344', // written work
	'Q8261' // novel
]);

interface WBSearchResponse {
	search?: { id: string }[];
}

interface WBEntity {
	labels?: Record<string, { value: string }>;
	aliases?: Record<string, { value: string }[]>;
	claims?: Record<string, { mainsnak?: { datavalue?: { value?: { id?: string } } } }[]>;
}

interface WBGetEntitiesResponse {
	entities?: Record<string, WBEntity>;
}

async function fetchWD<T>(params: Record<string, string>): Promise<T | null> {
	try {
		const url = `${WD_API}?${new URLSearchParams({ ...params, format: 'json' })}`;
		const res = await fetch(url, {
			signal: AbortSignal.timeout(WD_TIMEOUT_MS),
			headers: { 'User-Agent': WD_USER_AGENT }
		});
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

function isWrittenWork(entity: WBEntity): boolean {
	const p31 = entity.claims?.P31 ?? [];
	return p31.some((claim) => {
		const id = claim.mainsnak?.datavalue?.value?.id;
		return id ? WRITTEN_WORK_TYPES.has(id) : false;
	});
}

export interface TranslatedTitle {
	label: string;
	aliases: string[];
}

/**
 * Busca la etiqueta de `title` en `fromLang` como obra escrita en Wikidata,
 * y devuelve su etiqueta (y alias conocidos) en `toLang`. Devuelve null si
 * no hay ningún candidato claramente tipado como libro/obra literaria.
 */
export async function translateBookTitle(
	title: string,
	fromLang: string,
	toLang: string
): Promise<TranslatedTitle | null> {
	const trimmed = title.trim();
	if (!trimmed) return null;

	// Wikidata rankea la búsqueda por "prominencia" (nº de sitelinks, etc.), no
	// por relevancia al contexto "libro" — para un título genérico como
	// "Fundación" la novela puede aparecer bastante por detrás de conceptos
	// más enlazados (organizaciones, municipios...). limit=20 la capta en la
	// práctica sin disparar el coste de la llamada batched a wbgetentities.
	const search = await fetchWD<WBSearchResponse>({
		action: 'wbsearchentities',
		search: trimmed,
		language: fromLang,
		type: 'item',
		limit: '20'
	});
	const ids = (search?.search ?? []).map((r) => r.id);
	if (ids.length === 0) return null;

	const entities = await fetchWD<WBGetEntitiesResponse>({
		action: 'wbgetentities',
		ids: ids.join('|'),
		props: 'labels|aliases|claims',
		languages: toLang
	});
	if (!entities?.entities) return null;

	for (const id of ids) {
		const entity = entities.entities[id];
		if (!entity || !isWrittenWork(entity)) continue;

		const label = entity.labels?.[toLang]?.value;
		if (!label) continue;

		const aliases = (entity.aliases?.[toLang] ?? []).map((a) => a.value);
		return { label, aliases };
	}

	return null;
}
