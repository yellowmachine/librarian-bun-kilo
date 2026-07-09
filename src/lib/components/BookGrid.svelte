<script lang="ts">
	import { Check } from 'phosphor-svelte';
	import BookCard from './BookCard.svelte';

	interface Book {
		id: string;
		title: string;
		authors?: string[];
		coverUrl?: string | null;
		publishYear?: number | null;
		isAvailable?: boolean;
		/** "Copy 2 of 3" — shown when the user has more than one copy of this book */
		copyLabel?: string;
		href?: string;
		onclick?: () => void;
	}

	interface Props {
		books: Book[];
		/** Modo selección: oculta la navegación y muestra un checkbox por libro */
		selectable?: boolean;
		selectedIds?: Set<string>;
		onToggleSelect?: (id: string) => void;
	}

	let { books, selectable = false, selectedIds, onToggleSelect }: Props = $props();
</script>

<div
	class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
	style="column-gap: 1.5rem; row-gap: 2.5rem;"
>
	{#each books as book (book.id)}
		{#if selectable}
			{@const checked = selectedIds?.has(book.id) ?? false}
			<div class="relative">
				<button
					type="button"
					onclick={() => onToggleSelect?.(book.id)}
					aria-label={checked ? 'Deselect' : 'Select'}
					aria-pressed={checked}
					class="absolute top-1.5 left-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border transition-colors
					{checked ? 'border-ink bg-ink text-paper' : 'border-paper-border bg-paper/90 text-transparent'}"
				>
					<Check size={12} weight="bold" />
				</button>
				<BookCard
					title={book.title}
					authors={book.authors}
					coverUrl={book.coverUrl}
					publishYear={book.publishYear}
					isAvailable={book.isAvailable}
					copyLabel={book.copyLabel}
					variant="grid"
					onclick={() => onToggleSelect?.(book.id)}
				/>
			</div>
		{:else}
			<BookCard
				title={book.title}
				authors={book.authors}
				coverUrl={book.coverUrl}
				publishYear={book.publishYear}
				isAvailable={book.isAvailable}
				copyLabel={book.copyLabel}
				variant="grid"
				href={book.href}
				onclick={book.onclick}
			/>
		{/if}
	{/each}
</div>
