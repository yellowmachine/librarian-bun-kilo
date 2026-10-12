import { describe, it, expect } from 'vitest';
import { matchLocalAuthors, mergeAuthorResults } from '../authorSearch';
import type { AuthorSearchResult } from '$lib/types';

function ol(name: string): AuthorSearchResult {
	return {
		id: `OL-${name}`,
		name,
		birthDate: null,
		deathDate: null,
		topWork: null,
		workCount: 1,
		source: 'openlibrary'
	};
}

describe('matchLocalAuthors', () => {
	it('ignora tildes y mayúsculas y exige todas las palabras', () => {
		const result = matchLocalAuthors(
			[['Gabriel García Márquez'], ['Gabriel García Márquez', 'Otro'], ['Gabriel Celaya'], null],
			'marquez GARCIA'
		);
		expect(result).toEqual([
			{
				id: 'local:gabriel garcia marquez',
				name: 'Gabriel García Márquez',
				birthDate: null,
				deathDate: null,
				topWork: null,
				workCount: 2,
				source: 'local'
			}
		]);
	});

	it('agrupa grafías distintas y elige la más frecuente', () => {
		const result = matchLocalAuthors(
			[['Julio Cortázar'], ['julio cortazar'], ['Julio Cortázar']],
			'cort'
		);
		expect(result.map((a) => [a.name, a.workCount])).toEqual([['Julio Cortázar', 3]]);
	});

	it('ordena por nº de libros y respeta el límite', () => {
		const result = matchLocalAuthors([['Ana B'], ['Ana A'], ['Ana A'], ['Ana C']], 'ana', 2);
		expect(result.map((a) => a.name)).toEqual(['Ana A', 'Ana B']);
	});
});

describe('mergeAuthorResults', () => {
	it('pone los locales primero y quita duplicados de OpenLibrary', () => {
		const local = matchLocalAuthors([['Gabriel García Márquez']], 'garcia');
		const merged = mergeAuthorResults(local, [ol('Gabriel Garcia Marquez'), ol('Garcia Lorca')]);
		expect(merged.map((a) => [a.name, a.source])).toEqual([
			['Gabriel García Márquez', 'local'],
			['Garcia Lorca', 'openlibrary']
		]);
	});
});
