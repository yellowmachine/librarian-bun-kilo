// Tipos compartidos entre frontend y backend (no server-only)

export interface BookSearchResult {
	id: string; // OpenLibrary work ID, e.g. "OL45804W"
	isbn: string | null;
	title: string;
	authors: string[];
	coverUrl: string | null;
	publishYear: number | null;
}

/** Lo que la IA lee en la foto de una portada (POST /api/books/scan-cover). */
export interface BookCoverReading {
	title: string;
	subtitle: string | null;
	authors: string[];
	/** Título original si la portada es de una traducción (lo aporta la IA). */
	originalTitle: string | null;
	publisher: string | null;
	language: string | null;
	confidence: 'high' | 'medium' | 'low';
	/** La portada en la foto, en fracciones 0–1: [top, left, bottom, right]. */
	box: [number, number, number, number] | null;
}

/** cover: misma obra y misma portada; work: misma obra; other: otro libro; null: sin juzgar. */
export type BookCoverMatch = 'cover' | 'work' | 'other' | null;

export interface BookCoverCandidate extends BookSearchResult {
	match: BookCoverMatch;
}

export interface BookCoverScan {
	reading: BookCoverReading | null;
	/** Obras de OpenLibrary, la más probable primero. */
	candidates: BookCoverCandidate[];
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
