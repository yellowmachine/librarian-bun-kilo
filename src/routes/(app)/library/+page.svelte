<script lang="ts">
	import { Plus, MagnifyingGlass, Tag, Export } from 'phosphor-svelte';
	import type { UserBookWithDetails } from '$lib/server/books';
	import BookGrid from '$lib/components/BookGrid.svelte';

	let { data } = $props();
	const { userBooks, letter, by, titleLetters, authorLetters } = $derived(data);

	let search = $state('');
	let activeTag = $state<string | null>(null);

	const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

	const activeLetters = $derived(by === 'title' ? titleLetters : authorLetters);

	// Todas las etiquetas únicas del usuario (sobre el subconjunto cargado)
	const allTags = $derived(() => {
		const map = new Map<string, { id: string; name: string; color: string | null }>();
		for (const b of userBooks as UserBookWithDetails[]) {
			for (const t of b.tags) map.set(t.id, t);
		}
		return [...map.values()];
	});

	const filtered = $derived(() => {
		let list = userBooks as UserBookWithDetails[];
		if (activeTag) list = list.filter((b) => b.tags.some((t) => t.id === activeTag));
		if (search.trim()) {
			const q = search.toLowerCase();
			list = list.filter(
				(b) =>
					b.title.toLowerCase().includes(q) ||
					b.authors.some((a: string) => a.toLowerCase().includes(q))
			);
		}
		return list;
	});

	function letterHref(l: string) {
		return `/library?by=${by}&letter=${l}`;
	}

	function byHref(mode: 'title' | 'author') {
		return letter ? `/library?by=${mode}&letter=${letter}` : `/library?by=${mode}`;
	}
</script>

<div class="space-y-8">
	<!-- Cabecera -->
	<div class="flex items-end justify-between">
		<div>
			<h1 class="font-serif text-2xl sm:text-3xl font-normal text-ink">My library</h1>
			<p class="mt-1 text-sm text-ink-faint">
				{#if !letter}
					{titleLetters.length > 0 ? 'Showing recent books' : ''}
				{:else}
					{userBooks.length}
					{userBooks.length === 1 ? 'book' : 'books'}
				{/if}
			</p>
		</div>
		<div class="flex items-center gap-2">
			<a
				href="/tags"
				class="flex items-center gap-1.5 border border-paper-border px-4 py-2 text-sm text-ink-muted transition-colors hover:border-ink-faint hover:text-ink"
			>
				<Tag size={16} />
				Tags
			</a>
			<a
				href="/api/export"
				download="library.yaml"
				class="flex items-center gap-1.5 border border-paper-border px-4 py-2 text-sm text-ink-muted transition-colors hover:border-ink-faint hover:text-ink"
			>
				<Export size={16} />
				Export
			</a>
			<a
				href="/library/add"
				class="flex items-center gap-1.5 border border-ink bg-ink px-4 py-2 text-sm text-paper transition-colors hover:bg-ink/90"
			>
				<Plus size={16} weight="bold" />
				Add
			</a>
		</div>
	</div>

	{#if titleLetters.length > 0}
		<!-- Índice alfabético -->
		<div class="space-y-3">
			<!-- Toggle title / author -->
			<div class="flex gap-1 border-b border-paper-border">
				<a
					href={byHref('title')}
					class="border-b-2 pb-2 text-xs font-medium transition-colors
					{by === 'title' ? 'border-ink text-ink' : 'border-transparent text-ink-faint hover:text-ink-muted'}"
				>
					By title
				</a>
				<a
					href={byHref('author')}
					class="ml-4 border-b-2 pb-2 text-xs font-medium transition-colors
					{by === 'author' ? 'border-ink text-ink' : 'border-transparent text-ink-faint hover:text-ink-muted'}"
				>
					By author
				</a>
			</div>

			<!-- Letras -->
			<div class="flex flex-wrap gap-1">
				<a
					href="/library"
					class="flex h-7 w-7 items-center justify-center text-xs transition-colors
					{!letter ? 'bg-ink text-paper' : 'text-ink-muted hover:text-ink'}"
				>
					All
				</a>
				{#each ALPHABET as l}
					{@const available = activeLetters.includes(l)}
					{@const active = letter === l}
					{#if available}
						<a
							href={letterHref(l)}
							class="flex h-7 w-7 items-center justify-center text-xs font-medium transition-colors
							{active ? 'bg-ink text-paper' : 'text-ink hover:bg-paper-ui'}"
						>
							{l}
						</a>
					{:else}
						<span class="flex h-7 w-7 items-center justify-center text-xs text-ink-faint/30">
							{l}
						</span>
					{/if}
				{/each}
			</div>
		</div>

		<!-- Búsqueda + filtros de tag -->
		<div class="space-y-3">
			<div class="relative">
				<MagnifyingGlass
					size={16}
					class="absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
				/>
				<input
					type="search"
					bind:value={search}
					placeholder="Search by title or author..."
					class="w-full border border-paper-border bg-paper-ui py-2 pr-4 pl-9 text-sm text-ink placeholder-ink-faint focus:border-ink focus:bg-paper focus:ring-0"
				/>
			</div>

			{#if allTags().length > 0}
				<div class="flex flex-wrap items-center gap-2">
					<Tag size={14} class="text-ink-faint" />
					<button
						onclick={() => (activeTag = null)}
						class="rounded-full border px-3 py-0.5 text-xs transition-colors
						{activeTag === null
							? 'border-ink bg-ink text-paper'
							: 'border-paper-border text-ink-muted hover:border-ink-faint'}"
					>
						All
					</button>
					{#each allTags() as tag (tag.id)}
						<button
							onclick={() => (activeTag = activeTag === tag.id ? null : tag.id)}
							class="rounded-full border px-3 py-0.5 text-xs transition-colors
							{activeTag === tag.id
								? 'border-ink bg-ink text-paper'
								: 'border-paper-border text-ink-muted hover:border-ink-faint'}"
						>
							{tag.name}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Grid de libros -->
		{#if filtered().length === 0}
			<p class="py-12 text-center text-sm text-ink-faint">No results.</p>
		{:else}
			<BookGrid
				books={filtered().map((b) => ({
					id: b.userBookId,
					title: b.title,
					authors: b.authors,
					coverUrl: b.coverUrl,
					publishYear: b.publishYear,
					isAvailable: b.isAvailable,
					href: `/library/${b.userBookId}`
				}))}
			/>
		{/if}
	{:else}
		<!-- Estado vacío -->
		<div class="flex flex-col items-center justify-center py-24 text-center">
			<div class="mb-6 font-serif text-6xl text-ink-faint">·</div>
			<p class="text-sm text-ink-faint">Your library is empty.</p>
			<a href="/library/add" class="mt-4 text-sm text-ink underline underline-offset-2">
				Add your first book
			</a>
		</div>
	{/if}
</div>
