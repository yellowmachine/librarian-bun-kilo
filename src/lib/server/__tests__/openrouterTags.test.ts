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

describe('suggestTagsForBook · películas', () => {
	function promptOf(fetchMock: ReturnType<typeof vi.spyOn>): string {
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		return JSON.parse(init.body as string).messages[0].content;
	}

	it('describe la obra como película, con directores y géneros', async () => {
		const fetchMock = vi
			.spyOn(global, 'fetch')
			.mockResolvedValueOnce(modelReply('{"existing": ["Cine"], "new": []}'));

		const result = await suggestTagsForBook(
			'key',
			{ kind: 'movie', title: 'Alien', authors: ['Ridley Scott'], subjects: ['Terror'] },
			['Cine']
		);

		expect(result).toEqual({ existing: ['Cine'], proposed: [] });
		const prompt = promptOf(fetchMock);
		expect(prompt).toContain('this movie in their home video collection');
		expect(prompt).toContain('Director(s): Ridley Scott');
		expect(prompt).toContain('Genres: Terror');
		expect(prompt).toContain('other books and movies too');
		expect(prompt).not.toContain('Author(s)');
	});

	it('los libros siguen describiéndose como libros', async () => {
		const fetchMock = vi
			.spyOn(global, 'fetch')
			.mockResolvedValueOnce(modelReply('{"existing": [], "new": []}'));
		await suggestTagsForBook('key', BOOK, []);
		const prompt = promptOf(fetchMock);
		expect(prompt).toContain('this book in their personal library');
		expect(prompt).toContain('Author(s): Roald Dahl');
	});
});
