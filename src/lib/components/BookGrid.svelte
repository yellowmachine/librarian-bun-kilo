<script lang="ts">
	import BookCard from './BookCard.svelte';

	interface Book {
		id: string;
		title: string;
		authors?: string[];
		coverUrl?: string | null;
		publishYear?: number | null;
		isAvailable?: boolean;
		href?: string;
		onclick?: () => void;
	}

	interface Props {
		books: Book[];
	}

	let { books }: Props = $props();
</script>

<div
	class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
	style="column-gap: 1.5rem; row-gap: 2.5rem;"
>
	{#each books as book (book.id)}
		<BookCard
			title={book.title}
			authors={book.authors}
			coverUrl={book.coverUrl}
			publishYear={book.publishYear}
			isAvailable={book.isAvailable}
			variant="grid"
			href={book.href}
			onclick={book.onclick}
		/>
	{/each}
</div>
