// Tipos compartidos entre frontend y backend (no server-only)

export interface BookSearchResult {
	id: string; // OpenLibrary work ID, e.g. "OL45804W"
	isbn: string | null;
	title: string;
	authors: string[];
	coverUrl: string | null;
	publishYear: number | null;
}
