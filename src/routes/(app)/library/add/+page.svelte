<script lang="ts">
	import { Barcode, MagnifyingGlass, ArrowLeft, Plus, Trash, Info } from 'phosphor-svelte';
	import { page } from '$app/state';
	import IsbnScanner from '$lib/components/IsbnScanner.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import BookCard from '$lib/components/BookCard.svelte';
	import TagSelectorLocal from '$lib/components/TagSelectorLocal.svelte';
	import DuplicateBookDialog from '$lib/components/DuplicateBookDialog.svelte';
	import type { BookSearchResult } from '$lib/types';

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

	type Mode = 'choose' | 'scan' | 'manual' | 'results' | 'confirm' | 'form' | 'adding';

	interface Tag {
		id: string;
		name: string;
		color: string | null;
	}

	let mode = $state<Mode>('choose');
	let manualQuery = $state('');
	let searchResults = $state<BookSearchResult[]>([]);
	let translatedQuery = $state<string | null>(null);
	let selectedBook = $state<BookSearchResult | null>(null);
	let selectedDescription = $state<string | null>(null);
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

	// ── Manual form state ─────────────────────────────────────────────────────
	let formTitle = $state('');
	let formAuthors = $state<string[]>(['']);
	let formIsbn = $state('');
	let formPublishYear = $state('');
	let formDescription = $state('');
	let formAlternateTitle = $state('');

	function addAuthorField() {
		formAuthors = [...formAuthors, ''];
	}

	function removeAuthorField(i: number) {
		formAuthors = formAuthors.filter((_, idx) => idx !== i);
		if (formAuthors.length === 0) formAuthors = [''];
	}

	function resetFormFields() {
		formTitle = '';
		formAuthors = [''];
		formIsbn = '';
		formPublishYear = '';
		formDescription = '';
		formAlternateTitle = '';
		notes = '';
		selectedTagIds = [];
		tagsToCreate = [];
		errorMsg = '';
	}

	async function enterFormMode() {
		resetFormFields();
		await Promise.all([fetchUserTags(), fetchUserLibraries()]);
		mode = 'form';
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

	async function fetchDescription(workId: string): Promise<string | null> {
		try {
			const res = await fetch(`/api/books/detail?workId=${encodeURIComponent(workId)}`);
			if (!res.ok) return null;
			const data = await res.json();
			return data.description ?? null;
		} catch {
			return null;
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
		selectedTagIds = [];
		tagsToCreate = [];
		duplicateMatch = null;
		loadingDescription = true;
		mode = 'confirm';
		await Promise.all([
			fetchDescription(book.id).then((d) => {
				selectedDescription = d;
				loadingDescription = false;
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

	async function onIsbnDetected(isbn: string) {
		mode = 'results';
		searching = true;
		errorMsg = '';
		searchResults = [];
		translatedQuery = null;
		try {
			const res = await fetch(`/api/books/search?isbn=${encodeURIComponent(isbn)}`);
			const data = await res.json();
			searchResults = data;
			if (searchResults.length === 0) errorMsg = `Without results with ISBN ${isbn}`;
			else if (searchResults.length === 1) {
				await selectBook(searchResults[0]);
			}
		} catch {
			errorMsg = 'Search error. Check your connection.';
		} finally {
			searching = false;
		}
	}

	async function onManualSearch(e: SubmitEvent) {
		e.preventDefault();
		if (!manualQuery.trim()) return;
		mode = 'results';
		searching = true;
		errorMsg = '';
		searchResults = [];
		translatedQuery = null;
		try {
			const res = await fetch(`/api/books/search?q=${encodeURIComponent(manualQuery)}`);
			searchResults = await res.json();
			const translatedHeader = res.headers.get('X-Translated-Query');
			translatedQuery = translatedHeader ? decodeURIComponent(translatedHeader) : null;
			if (searchResults.length === 0) errorMsg = 'Without results.';
		} catch {
			errorMsg = 'Search error.';
		} finally {
			searching = false;
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
			mode = 'choose';
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
			mode = 'choose';
		} catch {
			errorMsg = 'Network error.';
			mode = 'form';
		}
	}
</script>

<div class="mx-auto max-w-md space-y-8">
	<!-- Cabecera -->
	<div class="flex items-center gap-3">
		<a href="/library" class="text-ink-faint hover:text-ink"><ArrowLeft size={20} /></a>
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
				<a href="/library" class="ml-4 shrink-0 text-xs text-ink underline underline-offset-2"
					>View library</a
				>
			</div>
		{/if}
		<div class="grid grid-cols-3 gap-3">
			<button
				onclick={() => (mode = 'scan')}
				class="group flex flex-col items-center gap-4 border border-paper-border p-6 transition-colors hover:border-ink"
			>
				<Barcode size={36} weight="thin" class="text-ink-faint group-hover:text-ink" />
				<span class="text-xs text-ink-muted">ISBN scan</span>
			</button>
			<button
				onclick={() => {
					manualQuery = '';
					mode = 'manual';
				}}
				class="group flex flex-col items-center gap-4 border border-paper-border p-6 transition-colors hover:border-ink"
			>
				<MagnifyingGlass size={36} weight="thin" class="text-ink-faint group-hover:text-ink" />
				<span class="text-xs text-ink-muted">Search</span>
			</button>
			<button
				onclick={enterFormMode}
				class="group flex flex-col items-center gap-4 border border-paper-border p-6 transition-colors hover:border-ink"
			>
				<Plus size={36} weight="thin" class="text-ink-faint group-hover:text-ink" />
				<span class="text-xs text-ink-muted">Enter manually</span>
			</button>
		</div>

		<!-- Escáner -->
	{:else if mode === 'scan'}
		<IsbnScanner
			onDetected={onIsbnDetected}
			onError={(e) => {
				errorMsg = e;
				mode = 'choose';
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
				class="min-w-0 flex-1 border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
			/>
			<button
				type="submit"
				class="border border-ink bg-ink px-4 py-2 text-sm text-paper hover:bg-ink/90"
			>
				Search
			</button>
		</form>

		<!-- Resultados -->
	{:else if mode === 'results'}
		<div>
			<div class="mb-4 flex items-center justify-between">
				<span class="text-xs tracking-widest text-ink-faint uppercase">Results</span>
				<button
					onclick={() => (mode = 'manual')}
					class="text-xs text-ink underline underline-offset-2"
				>
					New search
				</button>
			</div>
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
						<li class="border-b border-paper-border sm:border sm:border-paper-border">
							<BookCard
								title={book.title}
								authors={book.authors}
								coverUrl={book.coverUrl}
								publishYear={book.publishYear}
								variant="list"
								onclick={() => selectBook(book)}
							/>
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
					coverUrl={selectedBook.coverUrl}
					publishYear={selectedBook.publishYear}
					variant="detail"
				/>
				{#if selectedBook.isbn}
					<p class="mt-3 text-xs text-ink-faint">ISBN {selectedBook.isbn}</p>
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
						<a
							href="/library/{duplicateMatch.userBookId}"
							class="underline underline-offset-2 hover:text-ink">View it</a
						>
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
							class="text-xs text-ink-faint underline underline-offset-2 hover:text-ink-muted"
						>
							{descriptionExpanded ? 'Less' : 'More'}
						</button>
					{/if}
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
					class="mt-1.5 w-full border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
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
						class="mt-1.5 w-full border border-paper-border bg-paper px-3 py-2 text-sm focus:border-ink focus:ring-0"
					>
						{#each availableLibraries as lib (lib.id)}
							<option value={lib.id}>{lib.name}</option>
						{/each}
					</select>
				</div>
			{/if}

			<div>
				<span class="block text-xs font-medium tracking-widest text-ink-muted uppercase">
					Tags <span class="tracking-normal normal-case">(optional)</span>
				</span>
				<div class="mt-1.5">
					<TagSelectorLocal {availableTags} bind:selectedTagIds bind:tagsToCreate />
				</div>
			</div>

			<div class="flex gap-3">
				<button
					onclick={() => (mode = 'results')}
					class="flex-1 border border-paper-border py-2.5 text-sm text-ink-muted hover:border-ink-faint"
				>
					Cancel
				</button>
				<button
					onclick={handleAddClick}
					class="flex-1 border border-ink bg-ink py-2.5 text-sm text-paper hover:bg-ink/90"
				>
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
					class="mt-1.5 w-full border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
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
						<a
							href="/library/{duplicateMatch.userBookId}"
							class="underline underline-offset-2 hover:text-ink">View it</a
						>
					</p>
				</div>
			{/if}

			<div>
				<span class="block text-xs font-medium tracking-widest text-ink-muted uppercase">
					Authors <span class="tracking-normal text-ink-faint normal-case">(optional)</span>
				</span>
				<div class="mt-1.5 space-y-2">
					{#each formAuthors as _, i (i)}
						<div class="flex gap-2">
							<input
								type="text"
								bind:value={formAuthors[i]}
								placeholder="Author name"
								class="min-w-0 flex-1 border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
							/>
							{#if formAuthors.length > 1}
								<button
									type="button"
									onclick={() => removeAuthorField(i)}
									class="flex items-center justify-center border border-paper-border px-2.5 text-ink-faint hover:border-ink-faint hover:text-ink"
								>
									<Trash size={14} />
								</button>
							{/if}
						</div>
					{/each}
					<button
						type="button"
						onclick={addAuthorField}
						class="flex items-center gap-1.5 text-xs text-ink-faint hover:text-ink-muted"
					>
						<Plus size={12} /> Add author
					</button>
				</div>
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
					class="mt-1.5 w-full border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
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
						class="mt-1.5 w-full border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
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
						class="mt-1.5 w-full border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
					/>
				</div>
			</div>

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
					class="mt-1.5 w-full resize-none border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
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
					class="mt-1.5 w-full resize-none border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
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
						class="mt-1.5 w-full border border-paper-border bg-paper px-3 py-2 text-sm focus:border-ink focus:ring-0"
					>
						{#each availableLibraries as lib (lib.id)}
							<option value={lib.id}>{lib.name}</option>
						{/each}
					</select>
				</div>
			{/if}

			<div>
				<span class="block text-xs font-medium tracking-widest text-ink-muted uppercase">
					Tags <span class="tracking-normal text-ink-faint normal-case">(optional)</span>
				</span>
				<div class="mt-1.5">
					<TagSelectorLocal {availableTags} bind:selectedTagIds bind:tagsToCreate />
				</div>
			</div>

			<div class="flex gap-3 pt-1">
				<button
					type="button"
					onclick={() => (mode = 'choose')}
					class="flex-1 border border-paper-border py-2.5 text-sm text-ink-muted hover:border-ink-faint"
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={!formTitle.trim()}
					class="flex-1 border border-ink bg-ink py-2.5 text-sm text-paper hover:bg-ink/90 disabled:opacity-40"
				>
					Add to my library
				</button>
			</div>
		</form>

		<!-- Añadiendo -->
	{:else if mode === 'adding'}
		<div class="flex justify-center py-16">
			<Spinner size="lg" class="text-ink-faint" />
		</div>
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
