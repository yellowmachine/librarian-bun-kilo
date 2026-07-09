import { describe, it, expect, vi, afterEach } from 'vitest';
import { identifyBooksFromImage } from '../openrouterVision';

function jsonResponse(body: unknown, ok = true): Response {
	return { ok, json: async () => body } as Response;
}

const DATA_URL = 'data:image/jpeg;base64,AAAA';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('identifyBooksFromImage', () => {
	it('parsea una respuesta JSON limpia', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(
			jsonResponse({
				choices: [
					{
						message: {
							content: JSON.stringify([
								{ title: 'Foundation', author: 'Isaac Asimov', confidence: 'high' },
								{ title: 'Dune', author: null, confidence: 'medium' }
							])
						}
					}
				]
			})
		);

		const result = await identifyBooksFromImage('key', DATA_URL);
		expect(result).toEqual([
			{ title: 'Foundation', author: 'Isaac Asimov', confidence: 'high' },
			{ title: 'Dune', author: null, confidence: 'medium' }
		]);
	});

	it('quita el fence ```json si el modelo lo añade', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(
			jsonResponse({
				choices: [
					{
						message: {
							content:
								'```json\n[{"title": "Foundation", "author": null, "confidence": "low"}]\n```'
						}
					}
				]
			})
		);

		const result = await identifyBooksFromImage('key', DATA_URL);
		expect(result).toEqual([{ title: 'Foundation', author: null, confidence: 'low' }]);
	});

	it('descarta candidatos sin título y usa "medium" si falta confidence', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(
			jsonResponse({
				choices: [
					{
						message: {
							content: JSON.stringify([{ title: '' }, { title: 'Dune', author: 'Herbert' }])
						}
					}
				]
			})
		);

		const result = await identifyBooksFromImage('key', DATA_URL);
		expect(result).toEqual([{ title: 'Dune', author: 'Herbert', confidence: 'medium' }]);
	});

	it('devuelve lista vacía si la respuesta no es JSON válido', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(
			jsonResponse({ choices: [{ message: { content: 'not json at all' } }] })
		);

		expect(await identifyBooksFromImage('key', DATA_URL)).toEqual([]);
	});

	it('devuelve lista vacía si la API responde con error', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({}, false));

		expect(await identifyBooksFromImage('key', DATA_URL)).toEqual([]);
	});

	it('nunca lanza: un fallo de red se traduce en lista vacía', async () => {
		vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('network down'));

		await expect(identifyBooksFromImage('key', DATA_URL)).resolves.toEqual([]);
	});
});
