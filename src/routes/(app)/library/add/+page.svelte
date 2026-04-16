<script lang="ts">
	import { Barcode, MagnifyingGlass, ArrowLeft, SpinnerGap } from 'phosphor-svelte';
	import IsbnScanner from '$lib/components/IsbnScanner.svelte';
	import BookCard from '$lib/components/BookCard.svelte';
	import TagSelectorLocal from '$lib/components/TagSelectorLocal.svelte';

	type Mode = 'choose' | 'scan' | 'manual' | 'results' | 'confirm' | 'adding';

	interface Tag {
		id: string;
		name: string;
		color: string | null;
	}

	let mode = $state<Mode>('choose');
	let manualQuery = $state('');
	let searchResults = $state<SearchResult[]>([]);
	let selectedBook = $state<SearchResult | null>(null);
	let selectedDescription = $state<string | null>(null);
	let notes = $state('');
	let errorMsg = $state('');
	let searching = $state(false);
	let availableTags = $state<Tag[]>([]);
	let selectedTagIds = $state<string[]>([]);
	let tagsToCreate = $state<{ name: string; color: string | null }[]>([]);

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

	interface SearchResult {
		id: string;
		isbn: string | null;
		title: string;
		authors: string[];
		coverUrl: string | null;
		publishYear: number | null;
	}

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

	async function selectBook(book: SearchResult) {
		selectedBook = book;
		descriptionExpanded = false;
		selectedDescription = null;
		selectedTagIds = [];
		tagsToCreate = [];
		mode = 'confirm';
		await Promise.all([
			fetchDescription(book.id).then((d) => (selectedDescription = d)),
			fetchUserTags()
		]);
	}

	async function onIsbnDetected(isbn: string) {
		mode = 'results';
		searching = true;
		errorMsg = '';
		searchResults = [];
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
		try {
			const res = await fetch(`/api/books/search?q=${encodeURIComponent(manualQuery)}`);
			searchResults = await res.json();
			if (searchResults.length === 0) errorMsg = 'Without results.';
		} catch {
			errorMsg = 'Search error.';
		} finally {
			searching = false;
		}
	}

	async function addBook() {
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
			//goto('/library');
			mode = 'choose';
		} catch {
			errorMsg = 'Network error.';
			mode = 'confirm';
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
		<div class="grid grid-cols-2 gap-4">
			<button
				onclick={() => (mode = 'scan')}
				class="group flex flex-col items-center gap-4 border border-paper-border p-8 transition-colors hover:border-ink"
			>
				<Barcode size={40} weight="thin" class="text-ink-faint group-hover:text-ink" />
				<span class="text-sm text-ink-muted">ISBN scan</span>
			</button>
			<button
				onclick={() => (mode = 'manual')}
				class="group flex flex-col items-center gap-4 border border-paper-border p-8 transition-colors hover:border-ink"
			>
				<MagnifyingGlass size={40} weight="thin" class="text-ink-faint group-hover:text-ink" />
				<span class="text-sm text-ink-muted">Manual Search</span>
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
			{#if searching}
				<div class="flex justify-center py-12">
					<SpinnerGap size={24} class="animate-spin text-ink-faint" />
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

		<!-- Confirmar -->
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

			{#if descriptionVisible}
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
					onclick={addBook}
					class="flex-1 border border-ink bg-ink py-2.5 text-sm text-paper hover:bg-ink/90"
				>
					Add to my library
				</button>
			</div>
		</div>

		<!-- Añadiendo -->
	{:else if mode === 'adding'}
		<div class="flex justify-center py-16">
			<SpinnerGap size={28} class="animate-spin text-ink-faint" />
		</div>
	{/if}
</div>
