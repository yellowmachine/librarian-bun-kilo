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
			<h1 class="font-serif text-3xl font-normal text-neutral-900">Mi biblioteca</h1>
			<p class="mt-1 text-sm text-neutral-400">
				{userBooks.length}
				{userBooks.length === 1 ? 'libro' : 'libros'}
			</p>
		</div>
		<a
			href="/library/add"
			class="flex items-center gap-1.5 border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm text-white transition-colors hover:bg-neutral-800"
		>
			<Plus size={16} weight="bold" />
			Añadir
		</a>
	</div>

	{#if userBooks.length > 0}
		<!-- Búsqueda + filtros -->
		<div class="space-y-3">
			<div class="relative">
				<MagnifyingGlass
					size={16}
					class="absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400"
				/>
				<input
					type="search"
					bind:value={search}
					placeholder="Buscar por título o autor..."
					class="w-full border border-neutral-200 bg-neutral-50 py-2 pr-4 pl-9 text-sm text-neutral-900 placeholder-neutral-400 focus:border-neutral-900 focus:bg-white focus:ring-0"
				/>
			</div>

			{#if allTags().length > 0}
				<div class="flex flex-wrap items-center gap-2">
					<Tag size={14} class="text-neutral-400" />
					<button
						onclick={() => (activeTag = null)}
						class="rounded-full border px-3 py-0.5 text-xs transition-colors
						{activeTag === null
							? 'border-neutral-900 bg-neutral-900 text-white'
							: 'border-neutral-200 text-neutral-500 hover:border-neutral-400'}"
					>
						Todas
					</button>
					{#each allTags() as tag (tag.id)}
						<button
							onclick={() => (activeTag = activeTag === tag.id ? null : tag.id)}
							class="rounded-full border px-3 py-0.5 text-xs transition-colors
							{activeTag === tag.id
								? 'border-neutral-900 bg-neutral-900 text-white'
								: 'border-neutral-200 text-neutral-500 hover:border-neutral-400'}"
						>
							{tag.name}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Grid de libros -->
		{#if filtered().length === 0}
			<p class="py-12 text-center text-sm text-neutral-400">Sin resultados.</p>
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
			<div class="mb-6 font-serif text-6xl text-neutral-200">·</div>
			<p class="text-sm text-neutral-400">Tu biblioteca está vacía.</p>
			<a href="/library/add" class="mt-4 text-sm text-neutral-900 underline underline-offset-2">
				Añade tu primer libro
			</a>
		</div>
	{/if}
</div>
