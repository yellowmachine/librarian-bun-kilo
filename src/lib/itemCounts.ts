const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "3 books · 1 movie" — solo lo que no es cero; vacío si no hay nada. */
export function itemCountLabel(books: number, movies: number): string {
	return [
		books > 0 ? plural(books, 'book', 'books') : null,
		movies > 0 ? plural(movies, 'movie', 'movies') : null
	]
		.filter((p): p is string => p !== null)
		.join(' · ');
}
