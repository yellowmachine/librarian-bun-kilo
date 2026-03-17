<script lang="ts">
	import { goto } from '$app/navigation';
	import { Barcode, MagnifyingGlass, ArrowLeft, SpinnerGap } from 'phosphor-svelte';
	import IsbnScanner from '$lib/components/IsbnScanner.svelte';
	import BookCard from '$lib/components/BookCard.svelte';

	type Mode = 'choose' | 'scan' | 'manual' | 'results' | 'confirm' | 'adding';

	let mode = $state<Mode>('choose');
	let manualQuery = $state('');
	let searchResults = $state<SearchResult[]>([]);
	let selectedBook = $state<SearchResult | null>(null);
	let notes = $state('');
	let errorMsg = $state('');
	let searching = $state(false);

	interface SearchResult {
		id: string;
		isbn: string | null;
		title: string;
		authors: string[];
		coverUrl: string | null;
		publishYear: number | null;
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
			if (searchResults.length === 0) errorMsg = `Sin resultados para ISBN ${isbn}`;
			else if (searchResults.length === 1) {
				selectedBook = searchResults[0];
				mode = 'confirm';
			}
		} catch {
			errorMsg = 'Error al buscar. Comprueba tu conexión.';
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
			if (searchResults.length === 0) errorMsg = 'Sin resultados.';
		} catch {
			errorMsg = 'Error al buscar.';
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
					notes: notes || undefined
				})
			});
			if (!res.ok) {
				const e = await res.json();
				errorMsg = e.message ?? 'Error.';
				mode = 'confirm';
				return;
			}
			goto('/library');
		} catch {
			errorMsg = 'Error de red.';
			mode = 'confirm';
		}
	}
</script>

<div class="mx-auto max-w-md space-y-8">
	<!-- Cabecera -->
	<div class="flex items-center gap-3">
		<a href="/library" class="text-neutral-400 hover:text-neutral-900"><ArrowLeft size={20} /></a>
		<h1 class="font-serif text-2xl font-normal text-neutral-900">Añadir libro</h1>
	</div>

	{#if errorMsg}
		<p class="border border-neutral-900 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-900">
			{errorMsg}
		</p>
	{/if}

	<!-- Elegir modo -->
	{#if mode === 'choose'}
		<div class="grid grid-cols-2 gap-4">
			<button
				onclick={() => (mode = 'scan')}
				class="group flex flex-col items-center gap-4 border border-neutral-200 p-8 transition-colors hover:border-neutral-900"
			>
				<Barcode size={40} weight="thin" class="text-neutral-400 group-hover:text-neutral-900" />
				<span class="text-sm text-neutral-600">Escanear ISBN</span>
			</button>
			<button
				onclick={() => (mode = 'manual')}
				class="group flex flex-col items-center gap-4 border border-neutral-200 p-8 transition-colors hover:border-neutral-900"
			>
				<MagnifyingGlass
					size={40}
					weight="thin"
					class="text-neutral-400 group-hover:text-neutral-900"
				/>
				<span class="text-sm text-neutral-600">Buscar manual</span>
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
				placeholder="Título, autor o ISBN..."
				autofocus
				class="min-w-0 flex-1 border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-900 focus:ring-0"
			/>
			<button
				type="submit"
				class="border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800"
			>
				Buscar
			</button>
		</form>

		<!-- Resultados -->
	{:else if mode === 'results'}
		<div>
			<div class="mb-4 flex items-center justify-between">
				<span class="text-xs tracking-widest text-neutral-400 uppercase">Resultados</span>
				<button
					onclick={() => (mode = 'manual')}
					class="text-xs text-neutral-900 underline underline-offset-2"
				>
					Nueva búsqueda
				</button>
			</div>
			{#if searching}
				<div class="flex justify-center py-12">
					<SpinnerGap size={24} class="animate-spin text-neutral-400" />
				</div>
			{:else}
				<ul class="grid grid-cols-1 divide-neutral-100 sm:grid-cols-2 sm:gap-2">
					{#each searchResults as book (book.id)}
						<li class="border-b border-neutral-100 sm:border sm:border-neutral-100">
							<BookCard
								title={book.title}
								authors={book.authors}
								coverUrl={book.coverUrl}
								publishYear={book.publishYear}
								variant="list"
								onclick={() => {
									selectedBook = book;
									mode = 'confirm';
								}}
							/>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<!-- Confirmar -->
	{:else if mode === 'confirm' && selectedBook}
		<div class="space-y-6">
			<div class="border border-neutral-200 p-5">
				<BookCard
					title={selectedBook.title}
					authors={selectedBook.authors}
					coverUrl={selectedBook.coverUrl}
					publishYear={selectedBook.publishYear}
					variant="detail"
				/>
				{#if selectedBook.isbn}
					<p class="mt-3 text-xs text-neutral-300">ISBN {selectedBook.isbn}</p>
				{/if}
			</div>

			<div>
				<label
					for="notes"
					class="block text-xs font-medium tracking-widest text-neutral-500 uppercase"
				>
					Notas <span class="tracking-normal normal-case">(opcional)</span>
				</label>
				<textarea
					id="notes"
					bind:value={notes}
					rows="2"
					placeholder="Edición, estado del libro..."
					class="mt-1.5 w-full border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-900 focus:ring-0"
				></textarea>
			</div>

			<div class="flex gap-3">
				<button
					onclick={() => (mode = 'results')}
					class="flex-1 border border-neutral-200 py-2.5 text-sm text-neutral-600 hover:border-neutral-400"
				>
					Cancelar
				</button>
				<button
					onclick={addBook}
					class="flex-1 border border-neutral-900 bg-neutral-900 py-2.5 text-sm text-white hover:bg-neutral-800"
				>
					Añadir a mi biblioteca
				</button>
			</div>
		</div>

		<!-- Añadiendo -->
	{:else if mode === 'adding'}
		<div class="flex justify-center py-16">
			<SpinnerGap size={28} class="animate-spin text-neutral-400" />
		</div>
	{/if}
</div>
