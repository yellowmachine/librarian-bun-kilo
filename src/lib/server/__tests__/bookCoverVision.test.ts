import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../openlibrary', () => ({ searchBooks: vi.fn() }));
vi.mock('../aiUsage', () => ({ recordAiCall: vi.fn() }));

import {
	mergeResults,
	rankCandidates,
	scanBookCover,
	searchQueries,
	toReading,
	toVerdicts
} from '../bookCoverVision';
import { searchBooks } from '../openlibrary';
import { recordAiCall } from '../aiUsage';
import type { BookCoverReading, BookSearchResult } from '$lib/types';

const searchMock = vi.mocked(searchBooks);

function modelReply(items: unknown): Response {
	return {
		ok: true,
		json: async () => ({ choices: [{ message: { content: JSON.stringify(items) } }] })
	} as Response;
}

function book(id: string, coverUrl: string | null = null): BookSearchResult {
	return { id, isbn: null, title: id, authors: ['A'], coverUrl, publishYear: null };
}

const READING: BookCoverReading = {
	title: 'Cien años de soledad',
	subtitle: null,
	authors: ['Gabriel García Márquez'],
	originalTitle: null,
	publisher: null,
	language: 'es',
	confidence: 'high',
	box: null
};

afterEach(() => {
	vi.restoreAllMocks();
	searchMock.mockReset();
	vi.mocked(recordAiCall).mockReset();
});

describe('toReading', () => {
	it('normaliza la lectura y se queda con el primer libro válido', () => {
		expect(
			toReading([
				{ title: '  ', authors: ['X'] },
				{
					title: ' El nombre de la rosa ',
					subtitle: '',
					authors: ['Umberto Eco', 3, ''],
					original_title: 'Il nome della rosa',
					publisher: 'Lumen',
					language: 'es',
					confidence: 'rara',
					box_2d: [50, 100, 950, 900]
				},
				{ title: 'Otro' }
			])
		).toEqual([
			{
				title: 'El nombre de la rosa',
				subtitle: null,
				authors: ['Umberto Eco'],
				originalTitle: 'Il nome della rosa',
				publisher: 'Lumen',
				language: 'es',
				confidence: 'medium',
				box: [0.05, 0.1, 0.95, 0.9]
			}
		]);
	});

	it('descarta un título original igual al leído', () => {
		const [r] = toReading([{ title: 'Dune', original_title: 'dune' }]);
		expect(r.originalTitle).toBeNull();
	});

	it('sin título no hay lectura', () => {
		expect(toReading([{ authors: ['X'] }, 'basura'])).toEqual([]);
	});
});

describe('searchQueries', () => {
	it('prueba título+autor, título original+autor y solo el título', () => {
		expect(searchQueries({ ...READING, originalTitle: 'One Hundred Years of Solitude' })).toEqual([
			'Cien años de soledad Gabriel García Márquez',
			'One Hundred Years of Solitude Gabriel García Márquez',
			'Cien años de soledad'
		]);
	});

	it('sin autor ni título original no repite búsquedas', () => {
		expect(searchQueries({ ...READING, authors: [] })).toEqual(['Cien años de soledad']);
	});
});

describe('mergeResults', () => {
	it('junta en orden, sin repetir y con tope', () => {
		const merged = mergeResults(
			[
				[book('a'), book('b')],
				[book('b'), book('c'), book('d')]
			],
			3
		);
		expect(merged.map((b) => b.id)).toEqual(['a', 'b', 'c']);
	});
});

describe('toVerdicts', () => {
	it('ignora índices fuera de rango, repetidos y misma portada sin misma obra', () => {
		expect(
			toVerdicts(
				[
					{ candidate: 2, same_work: true, same_cover: true },
					{ candidate: '1', same_work: false, same_cover: true },
					{ candidate: 2, same_work: false, same_cover: false },
					{ candidate: 9, same_work: true },
					'basura'
				],
				3
			)
		).toEqual([
			{ index: 1, sameWork: true, sameCover: true },
			{ index: 0, sameWork: false, sameCover: false }
		]);
	});
});

describe('rankCandidates', () => {
	const books = [book('a'), book('b'), book('c'), book('d')];

	it('misma portada, misma obra, sin juzgar y al final otro libro', () => {
		const ranked = rankCandidates(books, [
			{ index: 0, sameWork: false, sameCover: false },
			{ index: 2, sameWork: true, sameCover: false },
			{ index: 3, sameWork: true, sameCover: true }
		]);
		expect(ranked.map((b) => [b.id, b.match])).toEqual([
			['d', 'cover'],
			['c', 'work'],
			['b', null],
			['a', 'other']
		]);
	});

	it('si la comparación falla, el orden de la búsqueda y sin juzgar', () => {
		const ranked = rankCandidates(books, null);
		expect(ranked.map((b) => [b.id, b.match])).toEqual([
			['a', null],
			['b', null],
			['c', null],
			['d', null]
		]);
		expect(ranked[0]).not.toHaveProperty('i');
	});
});

describe('scanBookCover', () => {
	it('lee, busca y ordena comparando portadas', async () => {
		const fetchMock = vi
			.spyOn(global, 'fetch')
			.mockResolvedValueOnce(modelReply([{ title: 'Cien años de soledad', authors: ['GGM'] }]))
			// portada de la candidata "b"
			.mockResolvedValueOnce(
				new Response(new Uint8Array(2000), { headers: { 'content-type': 'image/jpeg' } })
			)
			.mockResolvedValueOnce(
				modelReply([
					{ candidate: 1, same_work: false, same_cover: false },
					{ candidate: 2, same_work: true, same_cover: true }
				])
			);
		searchMock.mockResolvedValue([book('a'), book('b', 'https://covers.example/b.jpg')]);

		const scan = await scanBookCover('key', 'data:image/jpeg;base64,AAAA');

		expect(scan.reading?.title).toBe('Cien años de soledad');
		expect(scan.candidates.map((c) => [c.id, c.match])).toEqual([
			['b', 'cover'],
			['a', 'other']
		]);
		// La comparación lleva la foto y la portada descargada, en base64.
		const body = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
		const urls = body.messages[0].content
			.filter((p: { type: string }) => p.type === 'image_url')
			.map((p: { image_url: { url: string } }) => p.image_url.url);
		expect(urls).toHaveLength(2);
		expect(urls[1]).toMatch(/^data:image\/jpeg;base64,/);
	});

	it('apunta la lectura y la comparación por separado en el consumo de IA', async () => {
		vi.spyOn(global, 'fetch')
			.mockResolvedValueOnce(modelReply([{ title: 'Dune' }]))
			.mockResolvedValueOnce(modelReply([{ candidate: 1, same_work: true, same_cover: false }]));
		searchMock.mockResolvedValue([book('a')]);

		await scanBookCover('key', 'data:image/jpeg;base64,AAAA', {
			userId: 'u1',
			kind: 'book_cover_scan'
		});

		const calls = vi.mocked(recordAiCall).mock.calls;
		expect(calls.map(([ctx, call]) => [ctx.kind, call.resultCount])).toEqual([
			['book_cover_scan', 1],
			['book_cover_compare', 1]
		]);
	});

	it('sin lectura no busca nada', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(modelReply([]));
		vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await scanBookCover('key', 'data:image/jpeg;base64,AAAA')).toEqual({
			reading: null,
			candidates: []
		});
		expect(searchMock).not.toHaveBeenCalled();
	});

	it('si la comparación falla, devuelve las candidatas sin juzgar', async () => {
		vi.spyOn(global, 'fetch')
			.mockResolvedValueOnce(modelReply([{ title: 'Dune' }]))
			.mockRejectedValueOnce(new Error('offline'));
		vi.spyOn(console, 'error').mockImplementation(() => {});
		searchMock.mockResolvedValue([book('a')]);

		const scan = await scanBookCover('key', 'data:image/jpeg;base64,AAAA');
		expect(scan.candidates).toEqual([{ ...book('a'), match: null }]);
	});
});
