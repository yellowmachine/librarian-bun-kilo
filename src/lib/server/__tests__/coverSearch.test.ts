import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	askAiForCoverHints,
	extractOgImage,
	isPrivateAddress,
	isUsableImage,
	normalizeGoogleThumbnail
} from '../coverSearch';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('isPrivateAddress', () => {
	it.each([
		'127.0.0.1',
		'10.1.2.3',
		'172.20.0.5',
		'192.168.1.1',
		'169.254.169.254',
		'::1',
		'fd00::1',
		'::ffff:10.0.0.1'
	])('bloquea %s', (ip) => expect(isPrivateAddress(ip)).toBe(true));

	it.each(['8.8.8.8', '151.101.1.69', '2606:4700::1111'])('permite %s', (ip) =>
		expect(isPrivateAddress(ip)).toBe(false)
	);
});

describe('isUsableImage', () => {
	it('rechaza http, localhost e IPs privadas sin hacer ninguna petición', async () => {
		const spy = vi.spyOn(global, 'fetch');
		expect(await isUsableImage('http://example.com/a.jpg')).toBe(false);
		expect(await isUsableImage('https://localhost/a.jpg')).toBe(false);
		expect(await isUsableImage('https://127.0.0.1/a.jpg')).toBe(false);
		expect(await isUsableImage('https://[::1]/a.jpg')).toBe(false);
		expect(spy).not.toHaveBeenCalled();
	});
});

describe('extractOgImage', () => {
	it('lee og:image con cualquier orden de atributos y resuelve URLs relativas', () => {
		const html = `<head><meta content="/img/cover.jpg" property="og:image"></head>`;
		expect(extractOgImage(html, 'https://publisher.example/books/1')).toBe(
			'https://publisher.example/img/cover.jpg'
		);
	});

	it('prefiere og:image a twitter:image y decodifica &amp;', () => {
		const html = `<meta name="twitter:image" content="https://a.example/t.jpg">
			<meta property="og:image" content="https://a.example/c.jpg?w=1&amp;h=2">`;
		expect(extractOgImage(html, 'https://a.example/')).toBe('https://a.example/c.jpg?w=1&h=2');
	});

	it('devuelve null si no hay imagen', () => {
		expect(extractOgImage('<title>x</title>', 'https://a.example/')).toBeNull();
	});
});

describe('normalizeGoogleThumbnail', () => {
	it('fuerza https y quita el efecto de página doblada', () => {
		expect(
			normalizeGoogleThumbnail(
				'http://books.google.com/books/content?id=X&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api'
			)
		).toBe('https://books.google.com/books/content?id=X&printsec=frontcover&img=1&zoom=1');
	});
});

describe('askAiForCoverHints', () => {
	it('combina el JSON del modelo con las páginas citadas por la búsqueda web', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				choices: [
					{
						message: {
							content:
								'```json\n{"isbns": ["978-84-376-0494-7"], "pageUrls": ["https://pub.example/book"], "imageUrls": []}\n```',
							annotations: [
								{ type: 'url_citation', url_citation: { url: 'https://shop.example/p/1' } },
								{ type: 'url_citation', url_citation: { url: 'https://pub.example/book' } }
							]
						}
					}
				]
			})
		} as Response);

		const hints = await askAiForCoverHints('key', { title: 'Cien años de soledad', authors: [] });
		expect(hints).toEqual({
			isbns: ['978-84-376-0494-7'],
			pageUrls: ['https://pub.example/book', 'https://shop.example/p/1'],
			imageUrls: []
		});
	});

	it('devuelve pistas vacías si OpenRouter falla', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(global, 'fetch').mockResolvedValueOnce({
			ok: false,
			status: 402,
			text: async () => 'insufficient credits'
		} as Response);

		expect(await askAiForCoverHints('key', { title: 'X', authors: [] })).toEqual({
			isbns: [],
			pageUrls: [],
			imageUrls: []
		});
	});
});
