import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const mockEnv = vi.hoisted(() => ({ TMDB_API_KEY: 'abc123' as string | undefined }));
vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));

import {
	searchMovies,
	getMovie,
	getMovieCast,
	clearMovieCache,
	parseMovieId,
	toMovieId,
	isTmdbConfigured,
	CAST_LIMIT
} from '../tmdb';

function jsonResponse(body: unknown, ok = true): Response {
	return { ok, json: async () => body } as Response;
}

const BLADE_RUNNER = {
	id: 78,
	title: 'Blade Runner',
	original_title: 'Blade Runner',
	release_date: '1982-06-25',
	runtime: 117,
	genres: [
		{ id: 878, name: 'Ciencia ficción' },
		{ id: 18, name: 'Drama' }
	],
	overview: 'Los Ángeles, 2019. Rick Deckard…',
	poster_path: '/abc.jpg',
	credits: {
		cast: [
			{ name: 'Rutger Hauer', order: 1 },
			{ name: 'Harrison Ford', order: 0 },
			{ name: 'Sean Young', order: 2 }
		],
		crew: [
			{ name: 'Ridley Scott', job: 'Director' },
			{ name: 'Hampton Fancher', job: 'Screenplay' },
			{ name: 'Ridley Scott', job: 'Director' }
		]
	}
};

beforeEach(() => {
	mockEnv.TMDB_API_KEY = 'abc123';
});

afterEach(() => {
	vi.restoreAllMocks();
	clearMovieCache();
});

describe('ids', () => {
	it('convierte entre id de TMDB y movies.id', () => {
		expect(toMovieId(78)).toBe('tmdb-78');
		expect(parseMovieId('tmdb-78')).toBe(78);
		expect(parseMovieId('OL45804W')).toBeNull();
		expect(parseMovieId('tmdb-78; drop table')).toBeNull();
	});
});

describe('autenticación', () => {
	it('una clave v3 va como api_key', async () => {
		const fetchMock = vi
			.spyOn(global, 'fetch')
			.mockResolvedValueOnce(jsonResponse({ results: [] }));
		await searchMovies('alien');
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toContain('api_key=abc123');
		expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
	});

	it('un token v4 va en la cabecera Authorization', async () => {
		mockEnv.TMDB_API_KEY = 'eyJ-fake-v4-read-token-for-tests';
		const fetchMock = vi
			.spyOn(global, 'fetch')
			.mockResolvedValueOnce(jsonResponse({ results: [] }));
		await searchMovies('alien');
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).not.toContain('api_key');
		expect((init?.headers as Record<string, string>).Authorization).toBe(
			'Bearer eyJ-fake-v4-read-token-for-tests'
		);
	});

	it('sin clave no llama a TMDB', async () => {
		mockEnv.TMDB_API_KEY = undefined;
		const fetchMock = vi.spyOn(global, 'fetch');
		expect(isTmdbConfigured()).toBe(false);
		expect(await searchMovies('alien')).toEqual([]);
		expect(await getMovie(78)).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('searchMovies', () => {
	it('mapea los resultados', async () => {
		const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
			jsonResponse({
				results: [
					{
						id: 348,
						title: 'Alien, el octavo pasajero',
						original_title: 'Alien',
						release_date: '1979-05-25',
						poster_path: '/alien.jpg'
					},
					{ id: 999, title: 'Alien', original_title: 'Alien', release_date: '', poster_path: null }
				]
			})
		);

		const results = await searchMovies('alien', 1979);

		expect(results).toEqual([
			{
				id: 'tmdb-348',
				title: 'Alien, el octavo pasajero',
				originalTitle: 'Alien',
				releaseYear: 1979,
				posterUrl: 'https://image.tmdb.org/t/p/w185/alien.jpg'
			},
			{ id: 'tmdb-999', title: 'Alien', originalTitle: null, releaseYear: null, posterUrl: null }
		]);
		const url = String(fetchMock.mock.calls[0][0]);
		expect(url).toContain('/search/movie?');
		expect(url).toContain('query=alien');
		expect(url).toContain('language=es-ES');
		expect(url).toContain('year=1979');
	});

	it('respeta el límite', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(
			jsonResponse({ results: Array.from({ length: 20 }, (_, i) => ({ id: i, title: `M${i}` })) })
		);
		expect(await searchMovies('m', undefined, 5)).toHaveLength(5);
	});

	it('devuelve [] si TMDB responde con error', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({}, false));
		expect(await searchMovies('alien')).toEqual([]);
	});
});

describe('getMovie', () => {
	it('mapea la ficha con directores sin repetir y sin guardar los créditos', async () => {
		const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse(BLADE_RUNNER));

		const movie = await getMovie(78);

		expect(movie).toMatchObject({
			id: 'tmdb-78',
			title: 'Blade Runner',
			originalTitle: null,
			releaseYear: 1982,
			directors: ['Ridley Scott'],
			cast: ['Harrison Ford', 'Rutger Hauer', 'Sean Young'],
			runtime: 117,
			genres: ['Ciencia ficción', 'Drama'],
			overview: 'Los Ángeles, 2019. Rick Deckard…',
			posterUrl: 'https://image.tmdb.org/t/p/w500/abc.jpg'
		});
		expect(JSON.parse(movie!.tmdbData)).not.toHaveProperty('credits');
		expect(String(fetchMock.mock.calls[0][0])).toContain('append_to_response=credits');
	});

	it('se queda con los primeros actores del reparto', async () => {
		const cast = Array.from({ length: CAST_LIMIT + 5 }, (_, i) => ({
			name: `Actor ${i}`,
			order: i
		}));
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(
			jsonResponse({ ...BLADE_RUNNER, credits: { cast, crew: [] } })
		);

		const movie = await getMovie(78);

		expect(movie!.cast).toHaveLength(CAST_LIMIT);
		expect(movie!.cast[0]).toBe('Actor 0');
	});

	it('usa la sinopsis en inglés si no la hay en castellano', async () => {
		const fetchMock = vi
			.spyOn(global, 'fetch')
			.mockResolvedValueOnce(jsonResponse({ ...BLADE_RUNNER, overview: '' }))
			.mockResolvedValueOnce(jsonResponse({ ...BLADE_RUNNER, overview: 'In 2019 Los Angeles…' }));

		const movie = await getMovie(78);

		expect(movie?.overview).toBe('In 2019 Los Angeles…');
		expect(String(fetchMock.mock.calls[1][0])).toContain('language=en-US');
	});

	it('cachea la ficha', async () => {
		const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(BLADE_RUNNER));
		await Promise.all([getMovie(78), getMovie(78)]);
		await getMovie(78);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('no cachea un "no encontrado"', async () => {
		const fetchMock = vi
			.spyOn(global, 'fetch')
			.mockResolvedValueOnce(jsonResponse({}, false))
			.mockResolvedValueOnce(jsonResponse(BLADE_RUNNER));

		expect(await getMovie(78)).toBeNull();
		expect(await getMovie(78)).not.toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});

describe('getMovieCast', () => {
	it('pide solo los créditos y devuelve el reparto en orden', async () => {
		const fetchMock = vi
			.spyOn(global, 'fetch')
			.mockResolvedValueOnce(jsonResponse({ cast: BLADE_RUNNER.credits.cast }));

		expect(await getMovieCast(78)).toEqual(['Harrison Ford', 'Rutger Hauer', 'Sean Young']);
		expect(String(fetchMock.mock.calls[0][0])).toContain('/movie/78/credits');
	});

	it('[] si TMDB ya no tiene la película, null si falla', async () => {
		vi.spyOn(global, 'fetch')
			.mockResolvedValueOnce(new Response('{}', { status: 404 }))
			.mockResolvedValueOnce(new Response('{}', { status: 503 }));

		expect(await getMovieCast(78)).toEqual([]);
		expect(await getMovieCast(78)).toBeNull();
	});

	it('null sin clave de TMDB, sin hacer peticiones', async () => {
		mockEnv.TMDB_API_KEY = '';
		const fetchMock = vi.spyOn(global, 'fetch');

		expect(await getMovieCast(78)).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
