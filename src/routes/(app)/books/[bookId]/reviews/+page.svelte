<script lang="ts">
	import { ArrowLeft } from 'phosphor-svelte';
	import ReviewsSection from '$lib/components/ReviewsSection.svelte';

	let { data, form } = $props();
	let { book, myReview, reviews, reviewStats } = $derived(data);
</script>

<div class="mx-auto max-w-lg space-y-8">
	<!-- Cabecera -->
	<div>
		<a
			href="/library"
			class="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink"
		>
			<ArrowLeft size={16} /> My library
		</a>
		<div class="mt-4 flex items-start gap-4">
			{#if book.coverUrl}
				<img src={book.coverUrl} alt={book.title} class="h-20 w-14 flex-shrink-0 object-cover" />
			{/if}
			<div class="min-w-0">
				<h1 class="font-serif text-2xl leading-tight font-normal text-ink">{book.title}</h1>
				{#if book.authors && book.authors.length > 0}
					<p class="mt-1 text-sm text-ink-muted">{book.authors.join(', ')}</p>
				{/if}
			</div>
		</div>
	</div>

	<ReviewsSection
		{myReview}
		{reviews}
		stats={reviewStats}
		{form}
		emptyText="There are no reviews for this book yet."
	/>
</div>
