import { describe, it, expect, vi, afterEach } from 'vitest';
import { translateBookTitle } from '../wikidata';

function jsonResponse(body: unknown, ok = true): Response {
	return {
		ok,
		json: async () => body
	} as Response;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('translateBookTitle', () => {
	it('devuelve la etiqueta y los alias del primer candidato que es una obra escrita', async () => {
		const fetchMock = vi
			.spyOn(global, 'fetch')
			// wbsearchentities
			.mockResolvedValueOnce(jsonResponse({ search: [{ id: 'Q157031' }, { id: 'Q753894' }] }))
			// wbgetentities (batched, un solo fetch para todos los candidatos)
			.mockResolvedValueOnce(
				jsonResponse({
					entities: {
						Q157031: {
							labels: { en: { value: 'foundation' } },
							claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q157031' } } } }] } // no es obra escrita
						},
						Q753894: {
							labels: { en: { value: 'Foundation' } },
							aliases: { en: [{ value: 'Foundation Trilogy' }] },
							claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q7725634' } } } }] } // literary work
						}
					}
				})
			);

		const result = await translateBookTitle('Fundación', 'es', 'en');

		expect(result).toEqual({ label: 'Foundation', aliases: ['Foundation Trilogy'] });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('descarta candidatos que no son obra escrita y devuelve null si ninguno lo es', async () => {
		vi.spyOn(global, 'fetch')
			.mockResolvedValueOnce(jsonResponse({ search: [{ id: 'Q157031' }] }))
			.mockResolvedValueOnce(
				jsonResponse({
					entities: {
						Q157031: {
							labels: { en: { value: 'foundation' } },
							claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q157031' } } } }] }
						}
					}
				})
			);

		expect(await translateBookTitle('Fundación', 'es', 'en')).toBeNull();
	});

	it('devuelve null si la búsqueda no encuentra ningún candidato', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ search: [] }));

		expect(await translateBookTitle('asdkjqwoeiqwe', 'es', 'en')).toBeNull();
	});

	it('devuelve null si un candidato es obra escrita pero no tiene etiqueta en el idioma destino', async () => {
		vi.spyOn(global, 'fetch')
			.mockResolvedValueOnce(jsonResponse({ search: [{ id: 'Q753894' }] }))
			.mockResolvedValueOnce(
				jsonResponse({
					entities: {
						Q753894: {
							labels: {},
							claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q7725634' } } } }] }
						}
					}
				})
			);

		expect(await translateBookTitle('Fundación', 'es', 'en')).toBeNull();
	});

	it('nunca lanza: un fallo de red se traduce en null', async () => {
		vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('network down'));

		await expect(translateBookTitle('Fundación', 'es', 'en')).resolves.toBeNull();
	});

	it('devuelve null para un título vacío sin llamar a la red', async () => {
		const fetchMock = vi.spyOn(global, 'fetch');

		expect(await translateBookTitle('   ', 'es', 'en')).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
