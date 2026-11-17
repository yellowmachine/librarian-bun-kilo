import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import {
	getExportData,
	serializeExportYaml,
	serializeExportJson,
	serializeExportBibTex
} from '$lib/server/export';

const FORMATS = {
	yaml: { type: 'text/yaml', ext: 'yaml', serialize: serializeExportYaml },
	json: { type: 'application/json', ext: 'json', serialize: serializeExportJson },
	// Solo los libros: BibTeX es un formato de bibliografía
	bibtex: { type: 'application/x-bibtex', ext: 'bib', serialize: serializeExportBibTex }
} as const;

// GET /api/export?format=yaml|json|bibtex — todas las bibliotecas del usuario con
// sus libros y películas (lógica en $lib/server/export).
export async function GET({ locals, url }: RequestEvent) {
	if (!locals.user) error(401, 'Not authenticated');

	const format = url.searchParams.get('format') ?? 'yaml';
	// hasOwn: que «?format=constructor» no saque algo del prototipo
	if (!Object.hasOwn(FORMATS, format)) error(400, 'format must be yaml, json or bibtex');
	const spec = FORMATS[format as keyof typeof FORMATS];

	const body = spec.serialize(await getExportData(locals.user.id));
	const date = new Date().toISOString().slice(0, 10);
	return new Response(body, {
		headers: {
			'Content-Type': `${spec.type}; charset=utf-8`,
			'Content-Disposition': `attachment; filename="librarian-${date}.${spec.ext}"`
		}
	});
}
