import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../tmdb', () => ({ searchMovies: vi.fn() }));

import { identifyMoviesFromImage, matchWithTmdb, type MovieCandidate } from '../movieVision';
import { toBox } from '../openrouterVision';
import { searchMovies } from '../tmdb';

const searchMock = vi.mocked(searchMovies);

function modelReply(items: unknown): Response {
	return {
		ok: true,
		json: async () => ({ choices: [{ message: { content: JSON.stringify(items) } }] })
	} as Response;
}

afterEach(() => {
	vi.restoreAllMocks();
	searchMock.mockReset();
});

const CANDIDATE: MovieCandidate = {
	title: 'Alien, el octavo pasajero',
	originalTitle: 'Alien',
	releaseYear: 1979,
	director: null,
	format: 'bluray',
	edition: null,
	confidence: 'high',
	box: null
};

describe('identifyMoviesFromImage', () => {
	it('normaliza la respuesta del modelo', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(
			modelReply([
				{
					title: ' Blade Runner ',
					original_title: null,
					year: '1982',
					director: 'Ridley Scott',
					format: 'uhd_bluray',
					edition: 'Steelbook',
					confidence: 'high',
					box_2d: [100, 200, 900, 800]
				},
				{ title: 'Alien', year: 3, format: 'vhs', confidence: 'rara', box_2d: [0, 0, 10, 10] },
				{ title: '', confidence: 'high' },
				'basura'
			])
		);

		const result = await identifyMoviesFromImage('key', 'data:image/jpeg;base64,AAAA');

		expect(result).toEqual([
			{
				title: 'Blade Runner',
				originalTitle: null,
				releaseYear: 1982,
				director: 'Ridley Scott',
				format: 'uhd_bluray',
				edition: 'Steelbook',
				confidence: 'high',
				box: [0.1, 0.2, 0.9, 0.8]
			},
			{
				title: 'Alien',
				originalTitle: null,
				releaseYear: null,
				director: null,
				format: null,
				edition: null,
				confidence: 'medium',
				box: null
			}
		]);
	});

	it('devuelve [] si el modelo falla', async () => {
		vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('offline'));
		vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await identifyMoviesFromImage('key', 'data:image/jpeg;base64,AAAA')).toEqual([]);
	});
});

describe('toBox', () => {
	it('acota al rango y descarta cajas imposibles', () => {
		expect(toBox([-50, 0, 1200, 500])).toEqual([0, 0, 1, 0.5]);
		expect(toBox([500, 500, 100, 900])).toBeNull(); // invertida
		expect(toBox([0, 0, 1000])).toBeNull();
		expect(toBox('0,0,1000,1000')).toBeNull();
	});
});

describe('matchWithTmdb', () => {
	const hit = {
		id: 'tmdb-348',
		title: 'Alien, el octavo pasajero',
		originalTitle: 'Alien',
		releaseYear: 1979,
		posterUrl: null
	};

	it('usa título y año si encuentra algo', async () => {
		searchMock.mockResolvedValueOnce([hit]);
		expect(await matchWithTmdb(CANDIDATE)).toEqual([hit]);
		expect(searchMock).toHaveBeenCalledWith('Alien, el octavo pasajero', 1979, 4);
	});

	it('reintenta sin año y luego por el título original', async () => {
		searchMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([hit]);
		expect(await matchWithTmdb(CANDIDATE)).toEqual([hit]);
		expect(searchMock.mock.calls.map((c) => [c[0], c[1]])).toEqual([
			['Alien, el octavo pasajero', 1979],
			['Alien, el octavo pasajero', undefined],
			['Alien', 1979]
		]);
	});

	it('un fallo de TMDB cuenta como sin coincidencias', async () => {
		searchMock.mockRejectedValue(new Error('timeout'));
		expect(await matchWithTmdb({ ...CANDIDATE, originalTitle: null })).toEqual([]);
	});
});
