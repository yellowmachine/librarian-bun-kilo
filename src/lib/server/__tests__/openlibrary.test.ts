import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchAuthors } from '../openlibrary';

function jsonResponse(body: unknown, ok = true): Response {
	return {
		ok,
		json: async () => body
	} as Response;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('searchAuthors', () => {
	it('mapea los resultados y los ordena por nº de obras', async () => {
		const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
			jsonResponse({
				docs: [
					{ key: 'OL999A', name: 'Gabriel Garcia Marquez', work_count: 2 },
					{
						key: 'OL23919A',
						name: 'Gabriel García Márquez',
						birth_date: '6 March 1927',
						death_date: '17 April 2014',
						top_work: 'Cien años de soledad',
						work_count: 350
					}
				]
			})
		);

		const result = await searchAuthors('garcia marq');

		expect(result).toEqual([
			{
				id: 'OL23919A',
				name: 'Gabriel García Márquez',
				birthDate: '6 March 1927',
				deathDate: '17 April 2014',
				topWork: 'Cien años de soledad',
				workCount: 350
			},
			{
				id: 'OL999A',
				name: 'Gabriel Garcia Marquez',
				birthDate: null,
				deathDate: null,
				topWork: null,
				workCount: 2
			}
		]);
		expect(String(fetchMock.mock.calls[0][0])).toContain('/search/authors.json?q=garcia+marq');
	});

	it('devuelve [] si OpenLibrary responde con error', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({}, false));
		expect(await searchAuthors('tolkien')).toEqual([]);
	});

	it('respeta el límite', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(
			jsonResponse({
				docs: Array.from({ length: 10 }, (_, i) => ({
					key: `OL${i}A`,
					name: `A${i}`,
					work_count: i
				}))
			})
		);
		const result = await searchAuthors('abc', 3);
		expect(result.map((a) => a.id)).toEqual(['OL9A', 'OL8A', 'OL7A']);
	});
});
