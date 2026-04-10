<script lang="ts">
	import { Plus, MagnifyingGlass, Tag } from 'phosphor-svelte';
	import type { UserBookWithDetails } from '$lib/server/books';
	import BookGrid from '$lib/components/BookGrid.svelte';

	let { data } = $props();
	const { userBooks } = data;

	let search = $state('');
	let activeTag = $state<string | null>(null);

	// Todas las etiquetas únicas del usuario
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
</script>

<div class="space-y-8">
	<!-- Cabecera -->
	<div class="flex items-end justify-between">
		<div>
			<h1 class="font-serif text-3xl font-normal text-ink">My library</h1>
			<p class="mt-1 text-sm text-ink-faint">
				{userBooks.length}
				{userBooks.length === 1 ? 'book' : 'books'}
			</p>
		</div>
		<a
			href="/library/add"
			class="flex items-center gap-1.5 border border-ink bg-ink px-4 py-2 text-sm text-paper transition-colors hover:bg-ink/90"
		>
			<Plus size={16} weight="bold" />
			Add
		</a>
	</div>

	{#if userBooks.length > 0}
		<!-- Búsqueda + filtros -->
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
			<p class="py-12 text-center text-sm text-ink-faint">Without results.</p>
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
