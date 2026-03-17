// Servicio de integración con OpenLibrary API
// Docs: https://openlibrary.org/developers/api

export interface OpenLibraryBook {
	id: string; // work ID: "OL45804W"
	isbn: string | null;
	title: string;
	authors: string[];
	coverUrl: string | null;
	publishYear: number | null;
	publisher: string | null;
	language: string | null;
	description: string | null;
	openlibraryData: string; // JSON raw
}

// ─── Buscar por ISBN ──────────────────────────────────────────────────────────

export async function searchByIsbn(isbn: string): Promise<OpenLibraryBook | null> {
	const clean = isbn.replace(/[^0-9X]/gi, '');

	const res = await fetch(
		`https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&format=json&jscmd=data`
	);
	if (!res.ok) return null;

	const data = await res.json();
	const key = `ISBN:${clean}`;
	const book = data[key];
	if (!book) return null;

	return parseBookData(book, clean);
}

// ─── Buscar por título / autor ────────────────────────────────────────────────

export interface SearchResult {
	id: string;
	isbn: string | null;
	title: string;
	authors: string[];
	coverUrl: string | null;
	publishYear: number | null;
}

export async function searchBooks(query: string, limit = 10): Promise<SearchResult[]> {
	const params = new URLSearchParams({
		q: query,
		limit: String(limit),
		fields: 'key,title,author_name,cover_i,first_publish_year,isbn'
	});
	const res = await fetch(`https://openlibrary.org/search.json?${params}`);
	if (!res.ok) return [];

	const data = await res.json();
	const docs: unknown[] = data.docs ?? [];

	return docs.map((doc: any) => ({
		id: (doc.key as string).replace('/works/', ''),
		isbn: (doc.isbn as string[] | undefined)?.[0] ?? null,
		title: doc.title as string,
		authors: (doc.author_name as string[] | undefined) ?? [],
		coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
		publishYear: (doc.first_publish_year as number | undefined) ?? null
	}));
}

// ─── Obtener detalle completo de una obra ─────────────────────────────────────

export async function getWorkById(workId: string): Promise<OpenLibraryBook | null> {
	// Primero obtenemos el work
	const workRes = await fetch(`https://openlibrary.org/works/${workId}.json`);
	if (!workRes.ok) return null;
	const work = await workRes.json();

	// Autores
	const authorNames: string[] = [];
	if (Array.isArray(work.authors)) {
		await Promise.all(
			work.authors.slice(0, 5).map(async (a: any) => {
				const authorKey: string = a.author?.key ?? a.key ?? '';
				if (!authorKey) return;
				const aRes = await fetch(`https://openlibrary.org${authorKey}.json`);
				if (aRes.ok) {
					const aData = await aRes.json();
					if (aData.name) authorNames.push(aData.name as string);
				}
			})
		);
	}

	// Edición para ISBN, publisher, año, idioma
	const editionRes = await fetch(`https://openlibrary.org/works/${workId}/editions.json?limit=1`);
	let isbn: string | null = null;
	let publisher: string | null = null;
	let publishYear: number | null = null;
	let language: string | null = null;

	if (editionRes.ok) {
		const editions = await editionRes.json();
		const ed = editions.entries?.[0];
		if (ed) {
			isbn = ed.isbn_13?.[0] ?? ed.isbn_10?.[0] ?? null;
			publisher = ed.publishers?.[0] ?? null;
			publishYear = ed.publish_date ? parseInt(ed.publish_date.slice(-4)) || null : null;
			language = ed.languages?.[0]?.key?.replace('/languages/', '') ?? null;
		}
	}

	const coverId = work.covers?.[0];
	const coverUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null;

	const description =
		typeof work.description === 'string'
			? work.description
			: ((work.description?.value as string | undefined) ?? null);

	const raw: OpenLibraryBook = {
		id: workId,
		isbn,
		title: work.title as string,
		authors: authorNames,
		coverUrl,
		publishYear,
		publisher,
		language,
		description,
		openlibraryData: JSON.stringify(work)
	};

	return raw;
}

// ─── Helper interno ───────────────────────────────────────────────────────────

function parseBookData(book: any, isbn: string): OpenLibraryBook {
	const workKey: string = book.works?.[0]?.key ?? '';
	const workId = workKey.replace('/works/', '') || `isbn:${isbn}`;

	const authors: string[] = (book.authors ?? []).map((a: any) => a.name as string);

	const coverId = book.cover?.medium ?? book.cover?.large ?? book.cover?.small ?? null;

	const publishYear: number | null = book.publish_date
		? parseInt((book.publish_date as string).slice(-4)) || null
		: null;

	const description =
		typeof book.notes === 'string'
			? book.notes
			: ((book.notes?.value as string | undefined) ?? null);

	return {
		id: workId,
		isbn,
		title: book.title as string,
		authors,
		coverUrl: coverId ?? null,
		publishYear,
		publisher: (book.publishers ?? [])[0]?.name ?? null,
		language: (book.languages ?? [])[0]?.key?.replace('/languages/', '') ?? null,
		description,
		openlibraryData: JSON.stringify(book)
	};
}
