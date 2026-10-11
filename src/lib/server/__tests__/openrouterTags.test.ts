import { describe, it, expect, vi, afterEach } from 'vitest';
import { filterNewTags, subjectsFromOpenLibraryData, suggestTagsForBook } from '../openrouterTags';

function modelReply(content: string): Response {
	return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) } as Response;
}

const BOOK = { title: 'Fantastic Mr Fox', authors: ['Roald Dahl'] };

afterEach(() => {
	vi.restoreAllMocks();
});

describe('subjectsFromOpenLibraryData', () => {
	it('extrae las materias del JSON crudo de OpenLibrary', () => {
		expect(subjectsFromOpenLibraryData('{"subjects": ["Foxes", 3, "Fiction"]}')).toEqual([
			'Foxes',
			'Fiction'
		]);
	});

	it('devuelve [] si no hay materias o el JSON es inválido', () => {
		expect(subjectsFromOpenLibraryData('{}')).toEqual([]);
		expect(subjectsFromOpenLibraryData('nope')).toEqual([]);
		expect(subjectsFromOpenLibraryData(null)).toEqual([]);
	});
});

describe('filterNewTags', () => {
	it('descarta los que ya existen, repetidos, vacíos o demasiado largos, y limita a 3', () => {
		expect(
			filterNewTags(
				['  Ciencia   ficción ', 'novela', 'ciencia ficción', '', 'x'.repeat(41), 3, 'A', 'B', 'C'],
				['Novela']
			)
		).toEqual(['Ciencia ficción', 'A', 'B']);
	});

	it('devuelve [] si no es un array', () => {
		expect(filterNewTags('Novela', [])).toEqual([]);
	});
});

describe('suggestTagsForBook', () => {
	it('separa los tags existentes (con su nombre exacto) de los nuevos propuestos', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(
			modelReply(
				'```json\n{"existing": ["infantil", "Novela", "Inventado"], "new": ["Animales", "ensayo"]}\n```'
			)
		);

		const tags = await suggestTagsForBook('key', BOOK, ['Infantil', 'Novela', 'Ensayo']);
		expect(tags).toEqual({ existing: ['Infantil', 'Novela'], proposed: ['Animales'] });
	});

	it('acepta un array plano como lista de existentes', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(modelReply('["Novela"]'));

		const tags = await suggestTagsForBook('key', BOOK, ['Novela']);
		expect(tags).toEqual({ existing: ['Novela'], proposed: [] });
	});

	it('propone tags nuevos aunque el usuario no tenga ninguno', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(
			modelReply('{"existing": ["Novela"], "new": ["Infantil"]}')
		);

		const tags = await suggestTagsForBook('key', BOOK, []);
		expect(tags).toEqual({ existing: [], proposed: ['Infantil'] });
	});

	it('no sugiere nada si OpenRouter falla o la respuesta no es JSON', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(global, 'fetch')
			.mockResolvedValueOnce({ ok: false, status: 500, text: async () => '' } as Response)
			.mockResolvedValueOnce(modelReply('Infantil, Novela'));

		const none = { existing: [], proposed: [] };
		expect(await suggestTagsForBook('key', BOOK, ['Infantil'])).toEqual(none);
		expect(await suggestTagsForBook('key', BOOK, ['Infantil'])).toEqual(none);
	});
});
