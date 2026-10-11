import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	askAiForCoverHints,
	buildSearchQuery,
	isbn13To10,
	isbnCoverUrls,
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

describe('isbn13To10', () => {
	it('convierte ISBN-13 978 a ISBN-10, incluido el dígito de control X', () => {
		expect(isbn13To10('9780945466376')).toBe('0945466374');
		expect(isbn13To10('9781005485320')).toBe('1005485321');
		expect(isbn13To10('9780804429573')).toBe('080442957X');
	});

	it('deja un ISBN-10 tal cual y no convierte prefijos 979', () => {
		expect(isbn13To10('0945466374')).toBe('0945466374');
		expect(isbn13To10('9791234567896')).toBeNull();
	});
});

describe('isbnCoverUrls', () => {
	it('construye OpenLibrary, Casa del Libro y Amazon para un ISBN-13', () => {
		expect(isbnCoverUrls('9781005485320')).toEqual([
			'https://covers.openlibrary.org/b/isbn/9781005485320-M.jpg?default=false',
			'https://imagessl0.casadellibro.com/a/l/t1/20/9781005485320.jpg',
			'https://images-na.ssl-images-amazon.com/images/P/1005485321.01.LZZZZZZZ.jpg'
		]);
	});
});

describe('buildSearchQuery', () => {
	it('es una consulta corta: título entre comillas, autores y ISBN', () => {
		expect(
			buildSearchQuery({ title: 'El mito de la defensa nacional', authors: ['Hans-Hermann Hoppe'] })
		).toBe('"El mito de la defensa nacional" Hans-Hermann Hoppe ISBN');
	});
});
