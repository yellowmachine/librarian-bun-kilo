<script lang="ts">
	import { Tag } from 'phosphor-svelte';
	import BookGrid from '$lib/components/BookGrid.svelte';
	import type { UserBookWithDetails } from '$lib/server/books';

	let { data } = $props();
	const { books } = $derived(data);

	let activeTag = $state<string | null>(null);

	const allTags = $derived(() => {
		const map = new Map<string, { id: string; name: string; color: string | null }>();
		for (const b of books as UserBookWithDetails[]) {
			for (const t of b.tags) map.set(t.id, t);
		}
		return [...map.values()];
	});

	const filtered = $derived(() => {
		if (!activeTag) return books as UserBookWithDetails[];
		return (books as UserBookWithDetails[]).filter((b) =>
			b.tags.some((t) => t.id === activeTag)
		);
	});
</script>

<div class="space-y-8">
	<div>
		<h1 class="font-serif text-2xl font-normal text-ink sm:text-3xl">Recent activity</h1>
		<p class="mt-1 text-sm text-ink-faint">Last {books.length} books added</p>
	</div>

	{#if books.length > 0}
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

		{#if filtered().length === 0}
			<p class="py-12 text-center text-sm text-ink-faint">No books with this tag.</p>
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
		<div class="flex flex-col items-center justify-center py-24 text-center">
			<div class="mb-6 font-serif text-6xl text-ink-faint">·</div>
			<p class="text-sm text-ink-faint">No books added yet.</p>
			<a href="/library/add" class="mt-4 text-sm text-ink underline underline-offset-2">
				Add your first book
			</a>
		</div>
	{/if}
</div>
