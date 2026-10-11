import { describe, it, expect, vi, afterEach } from 'vitest';
import { subjectsFromOpenLibraryData, suggestTagsForBook } from '../openrouterTags';

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

describe('suggestTagsForBook', () => {
	it('solo devuelve tags existentes, con su nombre exacto', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(
			modelReply('```json\n["infantil", "Novela", "Inventado"]\n```')
		);

		const tags = await suggestTagsForBook('key', BOOK, ['Infantil', 'Novela', 'Ensayo']);
		expect(tags).toEqual(['Infantil', 'Novela']);
	});

	it('no llama a la IA si el usuario no tiene tags', async () => {
		const spy = vi.spyOn(global, 'fetch');
		expect(await suggestTagsForBook('key', BOOK, [])).toEqual([]);
		expect(spy).not.toHaveBeenCalled();
	});

	it('devuelve [] si OpenRouter falla o la respuesta no es JSON', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(global, 'fetch')
			.mockResolvedValueOnce({ ok: false, status: 500, text: async () => '' } as Response)
			.mockResolvedValueOnce(modelReply('Infantil, Novela'));

		expect(await suggestTagsForBook('key', BOOK, ['Infantil'])).toEqual([]);
		expect(await suggestTagsForBook('key', BOOK, ['Infantil'])).toEqual([]);
	});
});
