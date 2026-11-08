// Tipos compartidos entre frontend y backend (no server-only)

export interface BookSearchResult {
	id: string; // OpenLibrary work ID, e.g. "OL45804W"
	isbn: string | null;
	title: string;
	authors: string[];
	coverUrl: string | null;
	publishYear: number | null;
}

export interface MovieSearchResult {
	id: string; // "tmdb-<id>", el mismo id que movies.id
	title: string; // en castellano si TMDB lo tiene
	originalTitle: string | null;
	releaseYear: number | null;
	posterUrl: string | null; // miniatura (w185)
}

export interface AuthorSearchResult {
	id: string; // OpenLibrary author ID, e.g. "OL23919A" (o "local:<nombre>")
	name: string;
	birthDate: string | null;
	deathDate: string | null;
	topWork: string | null;
	workCount: number; // en resultados locales: nº de libros del usuario con ese autor
	source: 'local' | 'openlibrary';
}
