import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchAuthors, getWorkById, fetchWorkById, clearLookupCache } from '../openlibrary';

function jsonResponse(body: unknown, ok = true): Response {
	return {
		ok,
		json: async () => body
	} as Response;
}

afterEach(() => {
	vi.restoreAllMocks();
	clearLookupCache();
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
				workCount: 350,
				source: 'openlibrary'
			},
			{
				id: 'OL999A',
				name: 'Gabriel Garcia Marquez',
				birthDate: null,
				deathDate: null,
				topWork: null,
				workCount: 2,
				source: 'openlibrary'
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

describe('getWorkById (caché)', () => {
	function mockWorkFetch() {
		return vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
			const url = String(input);
			if (url.endsWith('/works/OL1W.json')) {
				return jsonResponse({ title: 'Dune', authors: [{ author: { key: '/authors/OL1A' } }] });
			}
			if (url.includes('/editions.json')) return jsonResponse({ entries: [] });
			if (url.endsWith('/authors/OL1A.json')) return jsonResponse({ name: 'Frank Herbert' });
			return jsonResponse({}, false);
		});
	}

	it('reutiliza el resultado en la segunda llamada', async () => {
		const fetchMock = mockWorkFetch();

		const first = await getWorkById('OL1W');
		const callsAfterFirst = fetchMock.mock.calls.length;
		const second = await getWorkById('OL1W');

		expect(first?.title).toBe('Dune');
		expect(first?.authors).toEqual(['Frank Herbert']);
		expect(second).toEqual(first);
		expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
	});

	it('comparte la petición entre llamadas simultáneas', async () => {
		const fetchMock = mockWorkFetch();

		await Promise.all([getWorkById('OL1W'), getWorkById('OL1W')]);

		expect(fetchMock.mock.calls.length).toBe(3);
	});

	it('no cachea un work no encontrado', async () => {
		const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({}, false));

		expect(await getWorkById('OL404W')).toBeNull();
		expect(await getWorkById('OL404W')).toBeNull();

		// work + editions en cada llamada
		expect(fetchMock.mock.calls.length).toBe(4);
	});

	it('fetchWorkById ignora la caché', async () => {
		const fetchMock = mockWorkFetch();

		await getWorkById('OL1W');
		const callsAfterFirst = fetchMock.mock.calls.length;
		await fetchWorkById('OL1W');

		expect(fetchMock.mock.calls.length).toBe(callsAfterFirst * 2);
	});
});
