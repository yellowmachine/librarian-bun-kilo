// Tipos compartidos entre frontend y backend (no server-only)

export interface BookSearchResult {
	id: string; // OpenLibrary work ID, e.g. "OL45804W"
	isbn: string | null;
	title: string;
	authors: string[];
	coverUrl: string | null;
	publishYear: number | null;
}

export interface AuthorSearchResult {
	id: string; // OpenLibrary author ID, e.g. "OL23919A"
	name: string;
	birthDate: string | null;
	deathDate: string | null;
	topWork: string | null;
	workCount: number;
}
