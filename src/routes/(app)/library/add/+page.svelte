<script lang="ts">
	import {
		Barcode,
		MagnifyingGlass,
		ArrowLeft,
		Plus,
		Info,
		Camera,
		Check,
		Sparkle,
		Book
	} from 'phosphor-svelte';
	import { page } from '$app/state';
	import { pushState } from '$app/navigation';
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import IsbnScanner from '$lib/components/IsbnScanner.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import Espera from '$lib/components/Espera.svelte';
	import BookCard from '$lib/components/BookCard.svelte';
	import TagSelectorLocal from '$lib/components/TagSelectorLocal.svelte';
	import DuplicateBookDialog from '$lib/components/DuplicateBookDialog.svelte';
	import AuthorListInput from '$lib/components/AuthorListInput.svelte';
	import CoverPicker from '$lib/components/CoverPicker.svelte';
	import { cropImage, resizeImageFile } from '$lib/image';
	import type {
		BookCoverMatch,
		BookCoverReading,
		BookCoverScan,
		BookSearchResult
	} from '$lib/types';

	interface Library {
		id: string;
		name: string;
		isDefault: boolean;
	}

	interface DuplicateMatch {
		type: 'exact' | 'isbn' | 'title-author';
		userBookId: string;
		title: string;
		authors: string[];
		coverUrl: string | null;
		libraryId: string;
	}

	type Mode =
		| 'choose'
		| 'scan'
		| 'manual'
		| 'results'
		| 'confirm'
		| 'form'
		| 'adding'
		| 'shelf-analyzing'
		| 'shelf-review'
		| 'shelf-adding'
		| 'cover-analyzing';

	interface Tag {
		id: string;
		name: string;
		color: string | null;
	}

	interface ShelfCandidate {
		title: string;
		author: string | null;
		confidence: 'high' | 'medium' | 'low';
		tags: string[];
	}

	interface ShelfSummary {
		added: number;
		duplicate: number;
		notFound: number;
	}

	let mode = $state<Mode>('choose');

	// Cada pantalla es una entrada del historial (shallow routing), para que el
	// botón atrás del navegador/móvil vuelva a la pantalla anterior en vez de
	// salir de la página. Los estados de espera (adding, analyzing…) no se
	// guardan: solo cambian `mode` localmente.
	function goTo(next: Mode) {
		// history.go() es asíncrono: si se navega antes de que termine el
		// rebobinado, el pushState se mezcla con él y al llegar el popstate se
		// restaura una pantalla vieja (o se vuelve a "choose"). Se aplaza hasta
		// que el rebobinado acabe.
		if (rewinding) {
			queuedMode = next;
			mode = next;
			return;
		}
		mode = next;
		pushState('', { addBookMode: next, addBookDepth: (page.state.addBookDepth ?? 0) + 1 });
	}

	let rewinding = false;
	let queuedMode: Mode | null = null;

	// Vuelve a la pantalla de elegir modo deshaciendo las entradas apiladas, así
	// después "atrás" sale de la página como se espera.
	function backToChoose() {
		const depth = page.state.addBookDepth ?? 0;
		mode = 'choose';
		queuedMode = null;
		if (depth > 0) {
			rewinding = true;
			history.go(-depth);
		}
	}

	// Atrás/adelante del navegador: restaura la pantalla guardada.
	$effect(() => {
		const state = page.state;
		untrack(() => {
			if (rewinding) {
				rewinding = false;
				const next = queuedMode;
				queuedMode = null;
				if (next) goTo(next);
				else mode = 'choose';
				return;
			}
			const target = (state.addBookMode ?? 'choose') as Mode;
			mode = target === 'confirm' && !selectedBook ? 'choose' : target;
		});
	});
	let manualQuery = $state('');
	let searchResults = $state<BookSearchResult[]>([]);
	let translatedQuery = $state<string | null>(null);
	let selectedBook = $state<BookSearchResult | null>(null);
	let selectedDescription = $state<string | null>(null);
	let selectedAlternateTitle = $state<string | null>(null);
	let notes = $state('');
	let errorMsg = $state('');
	let lastAddedTitle = $state<string | null>(null);
	let searching = $state(false);
	let availableTags = $state<Tag[]>([]);
	let selectedTagIds = $state<string[]>([]);
	let tagsToCreate = $state<{ name: string; color: string | null }[]>([]);
	let availableLibraries = $state<Library[]>([]);
	let selectedLibraryId = $state('');
	let duplicateMatch = $state<DuplicateMatch | null>(null);
	let showDuplicateDialog = $state(false);
	let pendingConfirmedAdd: (() => void) | null = null;

	const duplicateLibraryName = $derived(
		availableLibraries.find((lib) => lib.id === duplicateMatch?.libraryId)?.name ?? 'your library'
	);

	// ── Escanear estantería ───────────────────────────────────────────────────
	let shelfFileInput = $state<HTMLInputElement | null>(null);
	let shelfImagePreview = $state<string | null>(null);
	let shelfCandidates = $state<ShelfCandidate[]>([]);
	let selectedShelfIndices = new SvelteSet<number>();
	let shelfSummary = $state<ShelfSummary | null>(null);
	// Tags por candidato, indexados igual que shelfCandidates (por posición).
	let shelfCandidateTagIds = $state<string[][]>([]);
	let shelfCandidateNewTags = $state<{ name: string; color: string | null }[][]>([]);

	const allShelfSelected = $derived(
		shelfCandidates.length > 0 && shelfCandidates.every((_, i) => selectedShelfIndices.has(i))
	);

	function toggleShelfSelect(index: number) {
		if (selectedShelfIndices.has(index)) selectedShelfIndices.delete(index);
		else selectedShelfIndices.add(index);
	}

	function toggleShelfSelectAll() {
		if (allShelfSelected) selectedShelfIndices.clear();
		else shelfCandidates.forEach((_, i) => selectedShelfIndices.add(i));
	}

	async function onShelfPhotoSelected(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		errorMsg = '';
		shelfSummary = null;
		selectedShelfIndices.clear();
		shelfCandidateTagIds = [];
		shelfCandidateNewTags = [];
		mode = 'shelf-analyzing';
		try {
			// Comprimida en cliente: una foto de móvil son varios MB, y no hace
			// falta esa resolución para leer lomos.
			const dataUrl = await resizeImageFile(file);
			shelfImagePreview = dataUrl;
			const [res] = await Promise.all([
				fetch('/api/books/scan-shelf', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ image: dataUrl })
				}),
				fetchUserTags()
			]);
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				errorMsg = body?.message ?? 'Could not analyze the photo.';
				mode = 'choose';
				return;
			}
			const data = await res.json();
			shelfCandidates = data.candidates ?? [];
			shelfCandidates.forEach((c, i) => {
				if (c.confidence === 'high') selectedShelfIndices.add(i);
			});
			// Precarga los tags sugeridos por la IA, resolviendo el nombre a su id.
			shelfCandidateTagIds = shelfCandidates.map((c) =>
				c.tags
					.map((name) => availableTags.find((t) => t.name === name)?.id)
					.filter((id): id is string => Boolean(id))
			);
			shelfCandidateNewTags = shelfCandidates.map(() => []);
			if (shelfCandidates.length === 0) errorMsg = 'No books were recognized in that photo.';
			goTo('shelf-review');
		} catch {
			errorMsg = 'Could not analyze the photo. Check your connection.';
			mode = 'choose';
		} finally {
			if (shelfFileInput) shelfFileInput.value = '';
		}
	}

	async function addOneShelfCandidate(
		candidate: ShelfCandidate,
		summary: ShelfSummary,
		index: number
	) {
		const authors = candidate.author ? [candidate.author] : [];
		const tagIds = shelfCandidateTagIds[index];
		const newTags = shelfCandidateNewTags[index];

		try {
			const dup = await fetch(
				`/api/books/check-duplicate?title=${encodeURIComponent(candidate.title)}${authors
					.map((a) => `&authors=${encodeURIComponent(a)}`)
					.join('')}`
			).then((r) => r.json());
			if (dup?.match) {
				summary.duplicate++;
				return;
			}

			const query = [candidate.title, candidate.author].filter(Boolean).join(' ');
			const searchResults: BookSearchResult[] = await fetch(
				`/api/books/search?q=${encodeURIComponent(query)}`
			).then((r) => (r.ok ? r.json() : []));

			const body = {
				...(searchResults[0]
					? {
							workId: searchResults[0].id,
							isbn: searchResults[0].isbn ?? undefined,
							libraryId: selectedLibraryId || undefined
						}
					: {
							title: candidate.title,
							authors: authors.length > 0 ? authors : undefined,
							libraryId: selectedLibraryId || undefined
						}),
				tagsToAdd: tagIds?.length ? tagIds : undefined,
				tagsToCreate: newTags?.length ? newTags : undefined
			};

			const res = await fetch('/api/books', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (res.ok) summary.added++;
			else summary.notFound++;
		} catch {
			summary.notFound++;
		}
	}

	async function addSelectedShelfBooks() {
		mode = 'shelf-adding';
		const summary: ShelfSummary = { added: 0, duplicate: 0, notFound: 0 };
		const indices = Array.from(selectedShelfIndices);

		// En paralelo pero con un tope de concurrencia — lanzar las 15 peticiones
		// de golpe podría saturar/limitar la API de OpenLibrary.
		const CONCURRENCY = 4;
		let next = 0;
		async function worker() {
			while (next < indices.length) {
				const index = indices[next++];
				const candidate = shelfCandidates[index];
				if (candidate) await addOneShelfCandidate(candidate, summary, index);
			}
		}
		await Promise.all(
			Array.from({ length: Math.min(CONCURRENCY, indices.length) }, () => worker())
		);

		shelfSummary = summary;
		shelfCandidates = [];
		selectedShelfIndices.clear();
		shelfCandidateTagIds = [];
		shelfCandidateNewTags = [];
		shelfImagePreview = null;
		lastAddedTitle = null;
		backToChoose();
	}

	// ── Foto de la portada ────────────────────────────────────────────────────
	// Un solo libro: la IA lee la portada, el servidor busca obras candidatas y
	// las ordena comparando portadas. El usuario elige en la lista de
	// resultados, como en una búsqueda normal, y puede quedarse su foto (ya
	// recortada) como portada del ejemplar.

	let coverFileInput = $state<HTMLInputElement | null>(null);
	let coverPhotoPreview = $state<string | null>(null);
	let coverPhoto = $state<string | null>(null);
	let coverReading = $state<BookCoverReading | null>(null);
	let coverMatches = $state<Record<string, BookCoverMatch>>({});
	let usePhotoAsCover = $state(false);

	function clearCoverPhoto() {
		coverPhoto = null;
		coverPhotoPreview = null;
		coverReading = null;
		coverMatches = {};
		usePhotoAsCover = false;
	}

	async function onCoverPhotoSelected(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		clearCoverPhoto();
		errorMsg = '';
		shelfSummary = null;
		selectedBook = null;
		mode = 'cover-analyzing';
		try {
			const dataUrl = await resizeImageFile(file);
			coverPhotoPreview = dataUrl;
			const res = await fetch('/api/books/scan-cover', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ image: dataUrl })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				errorMsg = body?.message ?? 'Could not analyze the photo.';
				clearCoverPhoto();
				mode = 'choose';
				return;
			}
			const scan: BookCoverScan = await res.json();
			if (!scan.reading) {
				errorMsg = 'Could not read the cover. Try a sharper, straighter photo.';
				clearCoverPhoto();
				mode = 'choose';
				return;
			}
			coverReading = scan.reading;
			// Recorte de la portada para guardarla; sin caja fiable, la foto entera.
			coverPhoto = await cropImage(dataUrl, scan.reading.box).catch(() => null);
			coverMatches = Object.fromEntries(scan.candidates.map((c) => [c.id, c.match]));

			if (scan.candidates.length === 0) {
				// No está en OpenLibrary: alta manual con lo que se leyó.
				enterFormFromCover();
				return;
			}
			searchSeq++;
			searching = false;
			translatedQuery = null;
			searchResults = scan.candidates;
			goTo('results');
		} catch {
			errorMsg = 'Could not analyze the photo. Check your connection.';
			clearCoverPhoto();
			mode = 'choose';
		} finally {
			if (coverFileInput) coverFileInput.value = '';
		}
	}

	async function enterFormFromCover() {
		const reading = coverReading;
		resetFormFields();
		if (reading) {
			formTitle = reading.subtitle ? `${reading.title}: ${reading.subtitle}` : reading.title;
			formAuthors = reading.authors.length > 0 ? [...reading.authors] : [''];
			if (reading.originalTitle) formAlternateTitle = reading.originalTitle;
		}
		usePhotoAsCover = coverPhoto !== null;
		await Promise.all([fetchUserTags(), fetchUserLibraries()]);
		goTo('form');
	}

	// Best-effort: si falla, el libro queda añadido con la portada del catálogo.
	async function savePhotoCover(userBookId: string | undefined) {
		if (!userBookId || !coverPhoto || !usePhotoAsCover) return;
		const res = await fetch(`/api/books/${userBookId}/cover`, {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ image: coverPhoto })
		}).catch(() => null);
		if (!res?.ok) errorMsg = 'The book was added, but your photo could not be saved as its cover.';
	}

	// ── Manual form state ─────────────────────────────────────────────────────
	let formTitle = $state('');
	let formAuthors = $state<string[]>(['']);
	let formIsbn = $state('');
	let formPublishYear = $state('');
	let formDescription = $state('');
	let formAlternateTitle = $state('');
	let formCoverUrl = $state('');

	function resetFormFields() {
		formTitle = '';
		formAuthors = [''];
		formIsbn = '';
		formPublishYear = '';
		formDescription = '';
		formAlternateTitle = '';
		formCoverUrl = '';
		notes = '';
		selectedTagIds = [];
		tagsToCreate = [];
		tagsSuggested = false;
		proposedNewTags = [];
		formTagsNoSuggestions = false;
		errorMsg = '';
	}

	async function enterFormMode() {
		clearCoverPhoto();
		resetFormFields();
		await Promise.all([fetchUserTags(), fetchUserLibraries()]);
		goTo('form');
	}

	// ── OpenLibrary confirm state ─────────────────────────────────────────────

	let loadingDescription = $state(false);
	const DESCRIPTION_LIMIT = 300;
	let descriptionExpanded = $state(false);
	let descriptionTruncated = $derived(
		selectedDescription && selectedDescription.length > DESCRIPTION_LIMIT
	);
	let descriptionVisible = $derived(
		selectedDescription
			? descriptionExpanded
				? selectedDescription
				: selectedDescription.slice(0, DESCRIPTION_LIMIT)
			: null
	);

	async function fetchDetail(workId: string): Promise<{
		description: string | null;
		alternateTitle: string | null;
		subjects: string[];
	}> {
		const empty = { description: null, alternateTitle: null, subjects: [] };
		try {
			const res = await fetch(`/api/books/detail?workId=${encodeURIComponent(workId)}`);
			if (!res.ok) return empty;
			const data = await res.json();
			return {
				description: data.description ?? null,
				alternateTitle: data.alternateTitle ?? null,
				subjects: data.subjects ?? []
			};
		} catch {
			return empty;
		}
	}

	// Portada propia para un libro de OpenLibrary que no tiene ninguna.
	let confirmCoverUrl = $state('');

	// ── Tags sugeridos por IA (libro encontrado en OpenLibrary) ──────────────
	let suggestingTags = $state(false);
	let tagsSuggested = $state(false);
	// Tags nuevos propuestos por la IA: no se crean solos, el usuario los pulsa.
	let proposedNewTags = $state<string[]>([]);
	let pendingProposedTags = $derived(
		proposedNewTags.filter(
			(name) => !tagsToCreate.some((t) => t.name.toLowerCase() === name.toLowerCase())
		)
	);

	async function suggestTags(
		book: BookSearchResult,
		description: string | null,
		subjects: string[]
	): Promise<void> {
		suggestingTags = true;
		try {
			const res = await fetch('/api/books/suggest-tags', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ title: book.title, authors: book.authors, description, subjects })
			});
			if (!res.ok) return;
			const data: { tagIds: string[]; newTags?: string[] } = await res.json();
			// Si el usuario ya dejó la confirmación (p.ej. pasó a la entrada
			// manual), la respuesta llega tarde y no debe colarse en otro formulario.
			if (selectedBook?.id !== book.id || mode !== 'confirm') return;
			proposedNewTags = data.newTags ?? [];
			// Solo si el usuario no ha tocado ya los tags — la sugerencia nunca
			// pisa una elección manual.
			if (selectedTagIds.length === 0 && tagsToCreate.length === 0 && data.tagIds.length > 0) {
				selectedTagIds = data.tagIds;
				tagsSuggested = true;
			}
		} catch {
			// Best-effort: sin sugerencia el usuario elige a mano.
		} finally {
			if (selectedBook?.id === book.id) suggestingTags = false;
		}
	}

	// ── Tags sugeridos por IA (entrada manual) ────────────────────────────────
	// A diferencia del alta desde OpenLibrary no se lanza sola: el formulario
	// empieza vacío, así que se ofrece un botón en cuanto hay título y autor.
	let formTagsNoSuggestions = $state(false);
	let canSuggestFormTags = $derived(
		formTitle.trim().length > 0 && formAuthors.some((a) => a.trim().length > 0)
	);

	async function suggestFormTags(): Promise<void> {
		suggestingTags = true;
		formTagsNoSuggestions = false;
		try {
			const res = await fetch('/api/books/suggest-tags', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: formTitle.trim(),
					authors: formAuthors.map((a) => a.trim()).filter(Boolean),
					description: formDescription.trim() || null
				})
			});
			const data: { tagIds: string[]; newTags?: string[] } = res.ok
				? await res.json()
				: { tagIds: [] };
			// La ha pedido el usuario: se añade a lo ya elegido en vez de reemplazarlo.
			const added = data.tagIds.filter((id) => !selectedTagIds.includes(id));
			selectedTagIds = [...selectedTagIds, ...added];
			proposedNewTags = data.newTags ?? [];
			tagsSuggested = added.length > 0;
			formTagsNoSuggestions = added.length === 0 && proposedNewTags.length === 0;
		} catch {
			formTagsNoSuggestions = true;
		} finally {
			suggestingTags = false;
		}
	}

	async function fetchUserTags(): Promise<void> {
		try {
			const res = await fetch('/api/tags');
			if (res.ok) availableTags = await res.json();
		} catch {
			// tags are optional — silently ignore
		}
	}

	async function fetchUserLibraries(): Promise<void> {
		try {
			const res = await fetch('/api/libraries');
			if (!res.ok) return;
			availableLibraries = await res.json();
			if (!selectedLibraryId) {
				const fromUrl = page.url.searchParams.get('libraryId');
				const preselected = availableLibraries.find((lib) => lib.id === fromUrl);
				selectedLibraryId =
					preselected?.id ??
					availableLibraries.find((lib) => lib.isDefault)?.id ??
					availableLibraries[0]?.id ??
					'';
			}
		} catch {
			// falls back to the server-side default library
		}
	}

	async function checkDuplicate(criteria: {
		workId?: string;
		isbn?: string;
		title?: string;
		authors?: string[];
	}): Promise<void> {
		try {
			const params: string[] = [];
			if (criteria.workId) params.push(`workId=${encodeURIComponent(criteria.workId)}`);
			if (criteria.isbn) params.push(`isbn=${encodeURIComponent(criteria.isbn)}`);
			if (criteria.title) params.push(`title=${encodeURIComponent(criteria.title)}`);
			for (const author of criteria.authors ?? []) {
				params.push(`authors=${encodeURIComponent(author)}`);
			}

			const res = await fetch(`/api/books/check-duplicate?${params.join('&')}`);
			if (!res.ok) {
				duplicateMatch = null;
				return;
			}
			const data = await res.json();
			duplicateMatch = data.match ?? null;
		} catch {
			duplicateMatch = null;
		}
	}

	async function selectBook(book: BookSearchResult) {
		selectedBook = book;
		descriptionExpanded = false;
		selectedDescription = null;
		selectedAlternateTitle = null;
		selectedTagIds = [];
		tagsToCreate = [];
		tagsSuggested = false;
		proposedNewTags = [];
		confirmCoverUrl = '';
		// Con foto: por defecto la foto, salvo que el catálogo tenga la misma portada.
		usePhotoAsCover = coverPhoto !== null && (!book.coverUrl || coverMatches[book.id] !== 'cover');
		duplicateMatch = null;
		loadingDescription = true;
		goTo('confirm');
		await Promise.all([
			fetchDetail(book.id).then(({ description, alternateTitle, subjects }) => {
				selectedDescription = description;
				selectedAlternateTitle = alternateTitle;
				loadingDescription = false;
				return suggestTags(book, description, subjects);
			}),
			fetchUserTags(),
			fetchUserLibraries(),
			checkDuplicate({
				workId: book.id,
				isbn: book.isbn ?? undefined,
				title: book.title,
				authors: book.authors
			})
		]);
	}

	// Comprueba duplicados en la entrada manual mientras se escribe (con debounce),
	// ya que aquí no hay un "momento de selección" como en la ruta OpenLibrary.
	$effect(() => {
		const title = formTitle.trim();
		const isbn = formIsbn.trim();
		const authors = formAuthors.map((a) => a.trim()).filter(Boolean);

		if (mode !== 'form' || title.length <= 2) {
			duplicateMatch = null;
			return;
		}

		const timer = setTimeout(() => {
			checkDuplicate({ title, isbn: isbn || undefined, authors });
		}, 400);
		return () => clearTimeout(timer);
	});

	// Cada búsqueda invalida las anteriores: una respuesta tardía de una
	// búsqueda vieja no debe pisar (ni seleccionar) el libro de la nueva.
	let searchSeq = 0;

	async function onIsbnDetected(isbn: string) {
		clearCoverPhoto();
		const seq = ++searchSeq;
		selectedBook = null;
		goTo('results');
		searching = true;
		errorMsg = '';
		searchResults = [];
		translatedQuery = null;
		try {
			const res = await fetch(`/api/books/search?isbn=${encodeURIComponent(isbn)}`);
			const data = await res.json();
			if (seq !== searchSeq) return;
			searchResults = data;
			if (searchResults.length === 0) errorMsg = `Without results with ISBN ${isbn}`;
			else if (searchResults.length === 1) {
				await selectBook(searchResults[0]);
			}
		} catch {
			if (seq === searchSeq) errorMsg = 'Search error. Check your connection.';
		} finally {
			if (seq === searchSeq) searching = false;
		}
	}

	async function onManualSearch(e: SubmitEvent) {
		e.preventDefault();
		if (!manualQuery.trim()) return;
		clearCoverPhoto();
		const seq = ++searchSeq;
		goTo('results');
		searching = true;
		errorMsg = '';
		searchResults = [];
		translatedQuery = null;
		try {
			const res = await fetch(`/api/books/search?q=${encodeURIComponent(manualQuery)}`);
			const data = await res.json();
			if (seq !== searchSeq) return;
			searchResults = data;
			const translatedHeader = res.headers.get('X-Translated-Query');
			translatedQuery = translatedHeader ? decodeURIComponent(translatedHeader) : null;
			if (searchResults.length === 0) errorMsg = 'Without results.';
		} catch {
			if (seq === searchSeq) errorMsg = 'Search error.';
		} finally {
			if (seq === searchSeq) searching = false;
		}
	}

	function handleAddClick() {
		if (duplicateMatch) {
			pendingConfirmedAdd = () => addBook(true);
			showDuplicateDialog = true;
			return;
		}
		addBook(false);
	}

	async function addBook(allowDuplicate: boolean) {
		if (!selectedBook) return;
		mode = 'adding';
		errorMsg = '';
		try {
			const res = await fetch('/api/books', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					workId: selectedBook.id,
					isbn: selectedBook.isbn ?? undefined,
					coverUrl:
						(!usePhotoAsCover && !selectedBook.coverUrl && confirmCoverUrl.trim()) || undefined,
					notes: notes || undefined,
					libraryId: selectedLibraryId || undefined,
					allowDuplicate: allowDuplicate || undefined,
					tagsToAdd: selectedTagIds.length > 0 ? selectedTagIds : undefined,
					tagsToCreate: tagsToCreate.length > 0 ? tagsToCreate : undefined
				})
			});
			if (!res.ok) {
				const e = await res.json();
				errorMsg = e.message ?? 'Error.';
				mode = 'confirm';
				return;
			}
			const data = await res.json();
			lastAddedTitle = data.title ?? selectedBook.title;
			await savePhotoCover(data.userBookId);
			clearCoverPhoto();
			backToChoose();
		} catch {
			errorMsg = 'Network error.';
			mode = 'confirm';
		}
	}

	function onManualSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!formTitle.trim()) return;
		if (duplicateMatch) {
			pendingConfirmedAdd = () => addManualBook(true);
			showDuplicateDialog = true;
			return;
		}
		addManualBook(false);
	}

	function confirmDuplicateAdd() {
		showDuplicateDialog = false;
		const run = pendingConfirmedAdd;
		pendingConfirmedAdd = null;
		run?.();
	}

	function cancelDuplicateAdd() {
		showDuplicateDialog = false;
		pendingConfirmedAdd = null;
	}

	async function addManualBook(allowDuplicate: boolean) {
		mode = 'adding';
		errorMsg = '';
		const authors = formAuthors.map((a) => a.trim()).filter(Boolean);
		const year = formPublishYear ? parseInt(formPublishYear, 10) : undefined;
		try {
			const res = await fetch('/api/books', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: formTitle.trim(),
					authors: authors.length > 0 ? authors : undefined,
					manualIsbn: formIsbn.trim() || undefined,
					publishYear: year && !isNaN(year) ? year : undefined,
					description: formDescription.trim() || undefined,
					alternateTitle: formAlternateTitle.trim() || undefined,
					coverUrl: (!usePhotoAsCover && formCoverUrl.trim()) || undefined,
					notes: notes.trim() || undefined,
					libraryId: selectedLibraryId || undefined,
					allowDuplicate: allowDuplicate || undefined,
					tagsToAdd: selectedTagIds.length > 0 ? selectedTagIds : undefined,
					tagsToCreate: tagsToCreate.length > 0 ? tagsToCreate : undefined
				})
			});
			if (!res.ok) {
				const e = await res.json();
				errorMsg = e.message ?? 'Error.';
				mode = 'form';
				return;
			}
			const data = await res.json();
			lastAddedTitle = data.title ?? formTitle;
			resetFormFields();
			await savePhotoCover(data.userBookId);
			clearCoverPhoto();
			backToChoose();
		} catch {
			errorMsg = 'Network error.';
			mode = 'form';
		}
	}
</script>

<!-- Tags nuevos propuestos por la IA: no se crean solos, el usuario los pulsa. -->
{#snippet proposedTagIdeas()}
	{#if pendingProposedTags.length > 0}
		<div class="mt-2 flex flex-wrap items-center gap-2">
			<span class="flex items-center gap-1 text-xs text-ink-faint">
				<Sparkle size={12} /> New tag ideas:
			</span>
			{#each pendingProposedTags as name (name)}
				<button
					type="button"
					onclick={() => (tagsToCreate = [...tagsToCreate, { name, color: null }])}
					class="border border-dashed border-ink-faint px-2.5 py-0.5 text-xs text-ink-muted transition-colors hover:border-ink hover:text-ink"
				>
					+ {name}
				</button>
			{/each}
		</div>
	{/if}
{/snippet}

<!-- Portada del catálogo o la foto propia (solo tras una foto de portada). -->
{#snippet photoCoverChoice(catalogSrc: string | null, catalogLabel: string)}
	<div class="space-y-2">
		<span class="block text-xs font-medium tracking-widest text-ink-muted uppercase">Cover</span>
		<div class="grid grid-cols-2 gap-3">
			{#each [{ photo: false, label: catalogLabel, src: catalogSrc }, { photo: true, label: 'My photo', src: coverPhoto }] as option (option.photo)}
				<button
					type="button"
					onclick={() => (usePhotoAsCover = option.photo)}
					aria-pressed={usePhotoAsCover === option.photo}
					class="space-y-1.5 border p-2 text-xs transition-colors
					{usePhotoAsCover === option.photo
						? 'border-brown-700 text-ink'
						: 'border-paper-border text-ink-muted hover:border-ink-faint'}"
				>
					<div
						class="flex aspect-[2/3] w-full items-center justify-center overflow-hidden bg-paper-ui"
					>
						{#if option.src}
							<!-- La foto propia se ve entera: con object-cover, una foto
							     apaisada se recortaría otra vez al centro -->
							<img
								src={option.src}
								alt={option.label}
								class="h-full w-full {option.photo ? 'object-contain' : 'object-cover'}"
							/>
						{:else}
							<span class="px-2 text-ink-faint">No cover</span>
						{/if}
					</div>
					{option.label}
				</button>
			{/each}
		</div>
	</div>
{/snippet}

<div class="mx-auto max-w-md space-y-8">
	<!-- Cabecera -->
	<div class="flex items-center gap-3">
		<a
			href="/library"
			onclick={(e) => {
				// Dentro de un modo, la flecha vuelve a elegir modo en vez de salir.
				if (mode === 'choose') return;
				e.preventDefault();
				backToChoose();
			}}
			class="text-ink-faint hover:text-ink"><ArrowLeft size={20} /></a
		>
		<h1 class="font-serif text-2xl font-normal text-ink">Add book</h1>
	</div>

	{#if errorMsg}
		<p class="border border-ink bg-paper-ui px-4 py-2.5 text-sm text-ink">
			{errorMsg}
		</p>
	{/if}

	<!-- Elegir modo -->
	{#if mode === 'choose'}
		{#if lastAddedTitle}
			<div
				class="flex items-center justify-between border border-paper-border bg-paper-ui px-4 py-2.5 text-sm"
			>
				<span class="text-ink-muted"
					><span class="font-medium text-ink">{lastAddedTitle}</span> added to your library.</span
				>
				<a href="/library" class="ml-4 shrink-0 text-xs link-action">View library</a>
			</div>
		{/if}
		{#if shelfSummary}
			<div class="border border-paper-border bg-paper-ui px-4 py-2.5 text-sm text-ink-muted">
				Added {shelfSummary.added}
				{shelfSummary.added === 1 ? 'book' : 'books'} from the photo.
				{#if shelfSummary.duplicate > 0}
					{shelfSummary.duplicate} you already had.
				{/if}
				{#if shelfSummary.notFound > 0}
					{shelfSummary.notFound} could not be added.
				{/if}
			</div>
		{/if}
		<div class="grid grid-cols-2 gap-3">
			<button
				onclick={() => goTo('scan')}
				class="group flex flex-col items-center gap-4 border border-paper-border p-6 transition-colors hover:border-ink"
			>
				<Barcode size={36} weight="thin" class="text-ink-faint group-hover:text-ink" />
				<span class="text-xs text-ink-muted">ISBN scan</span>
			</button>
			<button
				onclick={() => {
					manualQuery = '';
					goTo('manual');
				}}
				class="group flex flex-col items-center gap-4 border border-paper-border p-6 transition-colors hover:border-ink"
			>
				<MagnifyingGlass size={36} weight="thin" class="text-ink-faint group-hover:text-ink" />
				<span class="text-xs text-ink-muted">Search</span>
			</button>
			<button
				onclick={() => {
					errorMsg = '';
					shelfSummary = null;
					coverFileInput?.click();
				}}
				class="group flex flex-col items-center gap-4 border border-paper-border p-6 transition-colors hover:border-ink"
			>
				<Book size={36} weight="thin" class="text-ink-faint group-hover:text-ink" />
				<span class="text-xs text-ink-muted">Cover photo</span>
			</button>
			<button
				onclick={() => {
					errorMsg = '';
					shelfSummary = null;
					shelfFileInput?.click();
				}}
				class="group flex flex-col items-center gap-4 border border-paper-border p-6 transition-colors hover:border-ink"
			>
				<Camera size={36} weight="thin" class="text-ink-faint group-hover:text-ink" />
				<span class="text-xs text-ink-muted">Scan shelf</span>
			</button>
			<button
				onclick={enterFormMode}
				class="group col-span-2 flex items-center justify-center gap-3 border border-paper-border p-4 transition-colors hover:border-ink"
			>
				<Plus size={24} weight="thin" class="text-ink-faint group-hover:text-ink" />
				<span class="text-xs text-ink-muted">Enter manually</span>
			</button>
		</div>
		<input
			bind:this={coverFileInput}
			type="file"
			accept="image/*"
			capture="environment"
			class="hidden"
			onchange={onCoverPhotoSelected}
		/>
		<input
			bind:this={shelfFileInput}
			type="file"
			accept="image/*"
			capture="environment"
			class="hidden"
			onchange={onShelfPhotoSelected}
		/>

		<!-- Escáner -->
	{:else if mode === 'scan'}
		<IsbnScanner
			onDetected={onIsbnDetected}
			onCancel={backToChoose}
			onError={(e) => {
				errorMsg = e;
				backToChoose();
			}}
		/>

		<!-- Búsqueda manual -->
	{:else if mode === 'manual'}
		<form onsubmit={onManualSearch} class="flex gap-2">
			<input
				type="text"
				bind:value={manualQuery}
				placeholder="Title, author or ISBN..."
				autofocus
				class="min-w-0 flex-1 border border-paper-border px-3 py-2 text-sm focus:border-brown-600 focus:ring-0"
			/>
			<button type="submit" class="border btn-primary px-4 py-2 text-sm"> Search </button>
		</form>

		<!-- Resultados -->
	{:else if mode === 'results'}
		<div>
			<div class="mb-4 flex items-center justify-between">
				<span class="text-xs tracking-widest text-ink-faint uppercase">Results</span>
				<button onclick={() => goTo('manual')} class="text-xs link-action"> New search </button>
			</div>
			{#if coverReading}
				<div class="mb-4 flex items-start gap-3">
					{#if coverPhoto}
						<img
							src={coverPhoto}
							alt="Your cover"
							class="h-16 w-12 shrink-0 border border-paper-border object-contain"
						/>
					{/if}
					<p class="text-xs text-ink-faint">
						Read on the cover: <strong class="text-ink-muted">{coverReading.title}</strong
						>{#if coverReading.authors.length > 0}, {coverReading.authors.join(', ')}{/if}. Pick
						your book, or
						<button type="button" onclick={enterFormFromCover} class="link-action"
							>enter it manually</button
						>.
					</p>
				</div>
			{/if}
			{#if translatedQuery}
				<p class="mb-4 text-xs text-ink-faint">
					Also showing results for <strong class="text-ink-muted">"{translatedQuery}"</strong>.
				</p>
			{/if}
			{#if searching}
				<div class="flex justify-center py-12">
					<Spinner size="md" class="text-ink-faint" />
				</div>
			{:else}
				<ul class="grid grid-cols-1 divide-paper-border sm:grid-cols-2 sm:gap-2">
					{#each searchResults as book (book.id)}
						{@const match = coverMatches[book.id]}
						<li
							class="border-b border-paper-border sm:border sm:border-paper-border {match ===
							'other'
								? 'opacity-50'
								: ''}"
						>
							<BookCard
								title={book.title}
								authors={book.authors}
								coverUrl={book.coverUrl}
								publishYear={book.publishYear}
								variant="list"
								onclick={() => selectBook(book)}
							/>
							{#if match === 'cover' || match === 'work'}
								<p class="flex items-center gap-1 px-3 pb-2 text-xs text-ink-faint">
									<Sparkle size={12} />
									{match === 'cover' ? 'Same cover as your photo' : 'Same book, another cover'}
								</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<!-- Confirmar (OpenLibrary) -->
	{:else if mode === 'confirm' && selectedBook}
		<div class="space-y-6">
			<div class="border border-paper-border p-5">
				<BookCard
					title={selectedBook.title}
					authors={selectedBook.authors}
					coverUrl={usePhotoAsCover && coverPhoto ? coverPhoto : selectedBook.coverUrl}
					publishYear={selectedBook.publishYear}
					variant="detail"
				/>
				{#if selectedBook.isbn}
					<p class="mt-3 text-xs text-ink-faint">ISBN {selectedBook.isbn}</p>
				{/if}
				{#if selectedAlternateTitle}
					<p class="mt-1 text-xs text-ink-faint">Also known as: {selectedAlternateTitle}</p>
				{/if}
			</div>

			{#if duplicateMatch}
				<div class="flex items-start gap-2.5 border border-paper-border bg-paper-ui px-4 py-3">
					<Info size={16} class="mt-0.5 shrink-0 text-ink-faint" />
					<p class="text-sm text-ink-muted">
						{#if duplicateMatch.type === 'exact'}
							You already have this book in <strong>{duplicateLibraryName}</strong>.
						{:else}
							You already have {duplicateMatch.type === 'isbn'
								? 'a book with the same ISBN'
								: 'a book with the same title and author'} in
							<strong>{duplicateLibraryName}</strong>.
						{/if}
						<a href="/library/{duplicateMatch.userBookId}" class="link-action">View it</a>
					</p>
				</div>
			{/if}

			{#if loadingDescription}
				<div class="flex items-center gap-2 text-xs text-ink-faint">
					<Spinner size="sm" />
					Loading synopsis…
				</div>
			{:else if descriptionVisible}
				<div class="space-y-2">
					<span class="block text-xs font-medium tracking-widest text-ink-muted uppercase"
						>Synopsis</span
					>
					<p class="text-sm leading-relaxed text-ink-muted">
						{descriptionVisible}{#if descriptionTruncated && !descriptionExpanded}…{/if}
					</p>
					{#if descriptionTruncated}
						<button
							type="button"
							onclick={() => (descriptionExpanded = !descriptionExpanded)}
							class="text-xs link-action"
						>
							{descriptionExpanded ? 'Less' : 'More'}
						</button>
					{/if}
				</div>
			{/if}

			{#if coverPhoto}
				{@render photoCoverChoice(selectedBook.coverUrl, 'OpenLibrary')}
			{/if}

			{#if !selectedBook.coverUrl && !usePhotoAsCover}
				<div>
					<span class="block text-xs font-medium tracking-widest text-ink-muted uppercase">
						Cover <span class="tracking-normal normal-case">(not on OpenLibrary)</span>
					</span>
					<div class="mt-1.5">
						<CoverPicker
							bind:value={confirmCoverUrl}
							title={selectedBook.title}
							authors={selectedBook.authors}
							isbn={selectedBook.isbn ?? ''}
							publishYear={selectedBook.publishYear}
						/>
					</div>
				</div>
			{/if}

			<div>
				<label
					for="notes"
					class="block text-xs font-medium tracking-widest text-ink-muted uppercase"
				>
					Notes <span class="tracking-normal normal-case">(optional)</span>
				</label>
				<textarea
					id="notes"
					bind:value={notes}
					rows="2"
					placeholder="Edition, book condition..."
					class="mt-1.5 w-full border border-paper-border px-3 py-2 text-sm focus:border-brown-600 focus:ring-0"
				></textarea>
			</div>

			{#if availableLibraries.length > 1}
				<div>
					<label
						for="confirm-library"
						class="block text-xs font-medium tracking-widest text-ink-muted uppercase"
					>
						Library
					</label>
					<select
						id="confirm-library"
						bind:value={selectedLibraryId}
						class="mt-1.5 w-full border border-paper-border bg-paper px-3 py-2 text-sm focus:border-brown-600 focus:ring-0"
					>
						{#each availableLibraries as lib (lib.id)}
							<option value={lib.id}>{lib.name}</option>
						{/each}
					</select>
				</div>
			{/if}

			<div>
				<span
					class="flex items-center gap-2 text-xs font-medium tracking-widest text-ink-muted uppercase"
				>
					Tags <span class="tracking-normal normal-case">(optional)</span>
					{#if suggestingTags}
						<span class="flex items-center gap-1 tracking-normal text-ink-faint normal-case">
							<Spinner size="sm" /> Suggesting…
						</span>
					{:else if tagsSuggested}
						<span class="flex items-center gap-1 tracking-normal text-ink-faint normal-case">
							<Sparkle size={12} /> Suggested by AI
						</span>
					{/if}
				</span>
				<div class="mt-1.5">
					<TagSelectorLocal {availableTags} bind:selectedTagIds bind:tagsToCreate />
				</div>
				{@render proposedTagIdeas()}
			</div>

			<div class="flex gap-3">
				<button onclick={() => history.back()} class="flex-1 border btn-secondary py-2.5 text-sm">
					Cancel
				</button>
				<button onclick={handleAddClick} class="flex-1 border btn-primary py-2.5 text-sm">
					Add to my library
				</button>
			</div>
		</div>

		<!-- Entrada manual -->
	{:else if mode === 'form'}
		<form onsubmit={onManualSubmit} class="space-y-5">
			<div>
				<label
					for="form-title"
					class="block text-xs font-medium tracking-widest text-ink-muted uppercase"
				>
					Title <span class="tracking-normal text-ink-faint normal-case">*</span>
				</label>
				<input
					id="form-title"
					type="text"
					bind:value={formTitle}
					required
					autofocus
					placeholder="Book title"
					class="mt-1.5 w-full border border-paper-border px-3 py-2 text-sm focus:border-brown-600 focus:ring-0"
				/>
			</div>

			{#if duplicateMatch}
				<div class="flex items-start gap-2.5 border border-paper-border bg-paper-ui px-4 py-3">
					<Info size={16} class="mt-0.5 shrink-0 text-ink-faint" />
					<p class="text-sm text-ink-muted">
						{#if duplicateMatch.type === 'exact'}
							You already have this book in <strong>{duplicateLibraryName}</strong>.
						{:else}
							You already have {duplicateMatch.type === 'isbn'
								? 'a book with the same ISBN'
								: 'a book with the same title and author'} in
							<strong>{duplicateLibraryName}</strong>.
						{/if}
						<a href="/library/{duplicateMatch.userBookId}" class="link-action">View it</a>
					</p>
				</div>
			{/if}

			<div>
				<span class="block text-xs font-medium tracking-widest text-ink-muted uppercase">
					Authors <span class="tracking-normal text-ink-faint normal-case">(optional)</span>
				</span>
				<AuthorListInput bind:authors={formAuthors} />
			</div>

			<div>
				<label
					for="form-alternate-title"
					class="block text-xs font-medium tracking-widest text-ink-muted uppercase"
				>
					Alternate title <span class="tracking-normal text-ink-faint normal-case">(optional)</span>
				</label>
				<input
					id="form-alternate-title"
					type="text"
					bind:value={formAlternateTitle}
					placeholder="Title in another language..."
					class="mt-1.5 w-full border border-paper-border px-3 py-2 text-sm focus:border-brown-600 focus:ring-0"
				/>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div>
					<label
						for="form-isbn"
						class="block text-xs font-medium tracking-widest text-ink-muted uppercase"
					>
						ISBN <span class="tracking-normal text-ink-faint normal-case">(optional)</span>
					</label>
					<input
						id="form-isbn"
						type="text"
						bind:value={formIsbn}
						placeholder="9780000000000"
						class="mt-1.5 w-full border border-paper-border px-3 py-2 text-sm focus:border-brown-600 focus:ring-0"
					/>
				</div>
				<div>
					<label
						for="form-year"
						class="block text-xs font-medium tracking-widest text-ink-muted uppercase"
					>
						Year <span class="tracking-normal text-ink-faint normal-case">(optional)</span>
					</label>
					<input
						id="form-year"
						type="number"
						bind:value={formPublishYear}
						placeholder="2024"
						min="0"
						max="9999"
						class="mt-1.5 w-full border border-paper-border px-3 py-2 text-sm focus:border-brown-600 focus:ring-0"
					/>
				</div>
			</div>

			{#if coverPhoto}
				{@render photoCoverChoice(formCoverUrl.trim() || null, 'Other cover')}
			{/if}

			{#if !usePhotoAsCover}
				<div>
					<span class="block text-xs font-medium tracking-widest text-ink-muted uppercase">
						{coverPhoto ? 'Other cover' : 'Cover'}
						<span class="tracking-normal text-ink-faint normal-case">(optional)</span>
					</span>
					<div class="mt-1.5">
						<CoverPicker
							bind:value={formCoverUrl}
							title={formTitle}
							authors={formAuthors}
							isbn={formIsbn}
							publishYear={formPublishYear ? parseInt(formPublishYear, 10) || null : null}
						/>
					</div>
				</div>
			{/if}

			<div>
				<label
					for="form-description"
					class="block text-xs font-medium tracking-widest text-ink-muted uppercase"
				>
					Description <span class="tracking-normal text-ink-faint normal-case">(optional)</span>
				</label>
				<textarea
					id="form-description"
					bind:value={formDescription}
					rows="3"
					placeholder="Synopsis or notes about the book..."
					class="mt-1.5 w-full resize-none border border-paper-border px-3 py-2 text-sm focus:border-brown-600 focus:ring-0"
				></textarea>
			</div>

			<div>
				<label
					for="form-notes"
					class="block text-xs font-medium tracking-widest text-ink-muted uppercase"
				>
					Personal notes <span class="tracking-normal text-ink-faint normal-case">(optional)</span>
				</label>
				<textarea
					id="form-notes"
					bind:value={notes}
					rows="2"
					placeholder="Edition, condition..."
					class="mt-1.5 w-full resize-none border border-paper-border px-3 py-2 text-sm focus:border-brown-600 focus:ring-0"
				></textarea>
			</div>

			{#if availableLibraries.length > 1}
				<div>
					<label
						for="form-library"
						class="block text-xs font-medium tracking-widest text-ink-muted uppercase"
					>
						Library
					</label>
					<select
						id="form-library"
						bind:value={selectedLibraryId}
						class="mt-1.5 w-full border border-paper-border bg-paper px-3 py-2 text-sm focus:border-brown-600 focus:ring-0"
					>
						{#each availableLibraries as lib (lib.id)}
							<option value={lib.id}>{lib.name}</option>
						{/each}
					</select>
				</div>
			{/if}

			<div>
				<div class="flex items-center gap-2">
					<span class="text-xs font-medium tracking-widest text-ink-muted uppercase">
						Tags <span class="tracking-normal text-ink-faint normal-case">(optional)</span>
					</span>
					{#if canSuggestFormTags}
						<button
							type="button"
							onclick={suggestFormTags}
							disabled={suggestingTags}
							class="ml-auto flex items-center gap-1 text-xs action-text disabled:opacity-60"
						>
							<Sparkle size={12} /> Suggest with AI
						</button>
						{#if suggestingTags}<Espera>Suggesting tags…</Espera>{/if}
					{/if}
				</div>
				<div class="mt-1.5">
					<TagSelectorLocal {availableTags} bind:selectedTagIds bind:tagsToCreate />
				</div>
				{#if tagsSuggested && !suggestingTags}
					<p class="mt-2 flex items-center gap-1 text-xs text-ink-faint">
						<Sparkle size={12} /> Suggested by AI
					</p>
				{:else if formTagsNoSuggestions && !suggestingTags}
					<p class="mt-2 text-xs text-ink-faint">No tag suggestions for this book.</p>
				{/if}
				{@render proposedTagIdeas()}
			</div>

			<div class="flex gap-3 pt-1">
				<button
					type="button"
					onclick={backToChoose}
					class="flex-1 border btn-secondary py-2.5 text-sm"
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={!formTitle.trim()}
					class="flex-1 border btn-primary py-2.5 text-sm disabled:opacity-40"
				>
					Add to my library
				</button>
			</div>
		</form>

		<!-- Añadiendo -->
	{:else if mode === 'adding'}
		<Espera>Adding to your library…</Espera>

		<!-- Analizando la foto de la estantería -->
	{:else if mode === 'shelf-analyzing'}
		<div class="flex flex-col items-center gap-4 py-16">
			{#if shelfImagePreview}
				<img
					src={shelfImagePreview}
					alt="Shelf preview"
					class="max-h-48 border border-paper-border object-contain"
				/>
			{/if}
			<Espera>Analyzing photo…</Espera>
		</div>

		<!-- Analizando la foto de la portada -->
	{:else if mode === 'cover-analyzing'}
		<div class="flex flex-col items-center gap-4 py-16">
			{#if coverPhotoPreview}
				<img
					src={coverPhotoPreview}
					alt="Cover preview"
					class="max-h-48 border border-paper-border object-contain"
				/>
			{/if}
			<Espera>Looking for your book…</Espera>
		</div>

		<!-- Revisar libros detectados -->
	{:else if mode === 'shelf-review'}
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<span class="text-xs tracking-widest text-ink-faint uppercase">
					{shelfCandidates.length}
					{shelfCandidates.length === 1 ? 'book' : 'books'} detected
				</span>
				<button onclick={toggleShelfSelectAll} class="text-xs link-action">
					{allShelfSelected ? 'Deselect all' : 'Select all'}
				</button>
			</div>

			<ul class="divide-y divide-paper-border border border-paper-border">
				{#each shelfCandidates as candidate, i (i)}
					{@const checked = selectedShelfIndices.has(i)}
					<li class="px-3 py-2.5">
						<div class="flex items-center gap-3">
							<button
								type="button"
								onclick={() => toggleShelfSelect(i)}
								aria-label={checked ? 'Deselect' : 'Select'}
								class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors
								{checked ? 'border-brown-700 bg-brown-700 text-brown-50' : 'border-paper-border text-transparent'}"
							>
								<Check size={12} weight="bold" />
							</button>
							<button
								type="button"
								onclick={() => toggleShelfSelect(i)}
								class="min-w-0 flex-1 text-left"
							>
								<span class="block truncate text-sm text-ink">{candidate.title}</span>
								{#if candidate.author}
									<span class="block truncate text-xs text-ink-faint">{candidate.author}</span>
								{/if}
							</button>
							{#if candidate.confidence !== 'high'}
								<span class="shrink-0 text-[10px] tracking-wide text-ink-faint uppercase">
									{candidate.confidence}
								</span>
							{/if}
						</div>
						<div class="mt-2 pl-8">
							<TagSelectorLocal
								{availableTags}
								bind:selectedTagIds={shelfCandidateTagIds[i]}
								bind:tagsToCreate={shelfCandidateNewTags[i]}
							/>
						</div>
					</li>
				{/each}
			</ul>

			<div class="flex gap-3">
				<button
					onclick={() => {
						shelfCandidates = [];
						selectedShelfIndices.clear();
						shelfImagePreview = null;
						backToChoose();
					}}
					class="flex-1 border btn-secondary py-2.5 text-sm"
				>
					Cancel
				</button>
				<button
					onclick={addSelectedShelfBooks}
					disabled={selectedShelfIndices.size === 0}
					class="flex-1 border btn-primary py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
				>
					Add {selectedShelfIndices.size || ''}
					{selectedShelfIndices.size === 1 ? 'book' : 'books'}
				</button>
			</div>
		</div>

		<!-- Añadiendo los libros seleccionados -->
	{:else if mode === 'shelf-adding'}
		<Espera>Adding books…</Espera>
	{/if}
</div>

{#if showDuplicateDialog && duplicateMatch}
	<DuplicateBookDialog
		book={{
			title: duplicateMatch.title,
			authors: duplicateMatch.authors,
			coverUrl: duplicateMatch.coverUrl
		}}
		matchType={duplicateMatch.type}
		libraryName={duplicateLibraryName}
		onconfirm={confirmDuplicateAdd}
		oncancel={cancelDuplicateAdd}
	/>
{/if}
