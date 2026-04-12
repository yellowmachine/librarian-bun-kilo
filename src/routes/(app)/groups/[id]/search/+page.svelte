<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { ArrowLeft, MagnifyingGlass, Tag } from 'phosphor-svelte';
	import StarRating from '$lib/components/StarRating.svelte';

	let { data, form } = $props();
	let { group, sharedTagsList, results, reviewStats, reviewsByBook, query, tagId, currentUserId } =
		$derived(data);

	let searchQuery = $state(query);
	let selectedTagId = $state(tagId);

	// bookId → expandido o no
	let expandedReviews = $state(new Set<string>());

	// userBookId del formulario de solicitud expandido (uno a la vez)
	let expandedRequest = $state<string | null>(null);

	function toggleReviews(bookId: string) {
		const next = new Set(expandedReviews);
		if (next.has(bookId)) next.delete(bookId);
		else next.add(bookId);
		expandedReviews = next;
	}

	function applyFilters() {
		const params = new URLSearchParams();
		if (searchQuery.trim()) params.set('q', searchQuery.trim());
		if (selectedTagId) params.set('tag', selectedTagId);
		goto(`?${params.toString()}`, { replaceState: true });
	}

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('es-ES', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div class="mx-auto max-w-2xl space-y-8">
	<div>
		<a
			href="/groups/{group.id}"
			class="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink"
		>
			<ArrowLeft size={16} />
			{group.name}
		</a>
		<h1 class="mt-2 font-serif text-2xl font-normal text-ink">Search books</h1>
	</div>

	{#if form?.loanError}
		<p class="border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{form.loanError}</p>
	{/if}
	{#if form?.loanId}
		<p class="border border-ink bg-paper-ui px-4 py-2.5 text-sm text-ink">
			Request sent. <a href="/loans/{form.loanId}" class="underline underline-offset-2"
				>Ver préstamo →</a
			>
		</p>
	{/if}

	<!-- Buscador -->
	<div class="flex gap-2">
		<div class="relative min-w-0 flex-1">
			<MagnifyingGlass
				size={16}
				class="absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
			/>
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Title, author or owner..."
				onkeydown={(e) => e.key === 'Enter' && applyFilters()}
				class="w-full border border-paper-border py-2 pr-4 pl-9 text-sm focus:border-ink focus:ring-0"
			/>
		</div>
		<button
			onclick={applyFilters}
			class="border border-ink bg-ink px-5 py-2 text-sm text-paper hover:bg-ink/90"
		>
			Search
		</button>
	</div>

	<!-- Filtro por etiqueta -->
	{#if sharedTagsList.length > 0}
		<div class="flex flex-wrap items-center gap-2">
			<Tag size={14} class="text-ink-faint" />
			{#each sharedTagsList as st (st.sharedTagId)}
				<button
					onclick={() => {
						selectedTagId = selectedTagId === st.tagId ? null : st.tagId;
						applyFilters();
					}}
					class="border px-3 py-0.5 text-xs transition-colors
					{selectedTagId === st.tagId
						? 'border-ink bg-ink text-paper'
						: 'border-paper-border text-ink-muted hover:border-ink-faint'}"
					style={st.tagColor && selectedTagId !== st.tagId
						? `border-color: ${st.tagColor}44; color: ${st.tagColor}`
						: ''}
				>
					{st.tagName} <span class="opacity-50">({st.bookCount})</span>
				</button>
			{/each}
			{#if selectedTagId}
				<button
					onclick={() => {
						selectedTagId = null;
						applyFilters();
					}}
					class="text-xs text-ink-faint hover:text-ink-muted"
				>
					clean ×
				</button>
			{/if}
		</div>
	{/if}

	<!-- Resultados -->
	{#if sharedTagsList.length === 0}
		<div class="flex flex-col items-center py-20 text-center">
			<p class="text-sm text-ink-faint">No member has shared tags in this group.</p>
			<a
				href="/groups/{group.id}"
				class="mt-3 text-sm text-ink underline underline-offset-2"
			>
				Manage tags
			</a>
		</div>
	{:else if results.length === 0}
		<p class="py-12 text-center text-sm text-ink-faint">
			{query || tagId ? 'No results for the current filters.' : 'Shared books will appear here.'}
		</p>
	{:else}
		<div class="space-y-1">
			<p class="text-xs text-ink-faint">
				{results.length}
				{results.length === 1 ? 'book' : 'books'}
			</p>
			<ul class="divide-y divide-paper-border">
				{#each results as book (book.userBookId)}
					<li class="flex items-center gap-4 py-4">
						{#if book.coverUrl}
							<img
								src={book.coverUrl}
								alt={book.title}
								class="h-16 w-11 flex-shrink-0 object-cover"
							/>
						{:else}
							<div
								class="flex h-16 w-11 flex-shrink-0 items-center justify-center bg-paper-ui font-serif text-xs text-ink-faint"
							>
								?
							</div>
						{/if}
						<div class="min-w-0 flex-1">
							<p class="font-medium text-ink">{book.title}</p>
							{#if book.authors.length > 0}
								<p class="truncate text-xs text-ink-faint">{book.authors.join(', ')}</p>
							{/if}
							{#if reviewStats[book.bookId]?.totalReviews > 0}
								<div class="mt-1 flex items-center gap-1.5">
									<StarRating
										value={Math.round(reviewStats[book.bookId].averageRating ?? 0)}
										readonly
										size={12}
									/>
									<button
										type="button"
										onclick={() => toggleReviews(book.bookId)}
										class="text-xs text-ink-faint hover:text-ink-muted"
									>
										{reviewStats[book.bookId].averageRating?.toFixed(1)}
										({reviewStats[book.bookId].totalReviews}
										{reviewStats[book.bookId].totalReviews === 1 ? 'reseña' : 'reseñas'})
										{expandedReviews.has(book.bookId) ? '▲' : '▼'}
									</button>
								</div>

								{#if expandedReviews.has(book.bookId)}
									<div class="mt-2 space-y-2 border-l-2 border-paper-border pl-3">
										{#each reviewsByBook[book.bookId] ?? [] as review (review.id)}
											<div class="space-y-0.5">
												<div class="flex items-center gap-2">
													<span class="text-xs font-medium text-ink-muted">{review.userName}</span>
													<StarRating value={review.rating} readonly size={11} />
													<span class="text-xs text-ink-faint">{formatDate(review.createdAt)}</span>
												</div>
												{#if review.body}
													<p class="text-xs leading-relaxed text-ink-muted">{review.body}</p>
												{/if}
											</div>
										{/each}
										<a
											href="/books/{book.bookId}/reviews"
											class="block text-xs text-ink-faint underline underline-offset-2 hover:text-ink-muted"
										>
											See all reviews →
										</a>
									</div>
								{/if}
							{:else}
								<a
									href="/books/{book.bookId}/reviews"
									class="mt-1 block text-xs text-ink-faint hover:text-ink-muted"
								>
									No reviews · Be the first →
								</a>
							{/if}
							<div class="mt-1.5 flex flex-wrap items-center gap-2">
								<span class="text-xs text-ink-faint">de {book.ownerName}</span>
								{#each book.tags as tag (tag.id)}
									<span
										class="border px-2 py-0.5 text-xs"
										style={tag.color
											? `border-color: ${tag.color}44; color: ${tag.color}`
											: 'border-color: #e8e2da; color: #737373'}
									>
										{tag.name}
									</span>
								{/each}
							</div>
						</div>
						<div class="flex shrink-0 flex-col items-end gap-2">
							{#if book.isAvailable}
								<span class="text-xs text-ink-faint">available</span>
								{#if book.ownerId !== currentUserId}
									{#if expandedRequest === book.userBookId}
										<form
											method="POST"
											action="?/requestLoan"
											use:enhance
											class="flex flex-col gap-1.5"
										>
											<input type="hidden" name="userBookId" value={book.userBookId} />
											<textarea
												name="notes"
												placeholder="Message to the owner (optional)"
												rows="2"
												class="w-44 resize-none border border-paper-border bg-paper px-2 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-ink focus:ring-0 focus:outline-none"
											></textarea>
											<div class="flex gap-1">
												<button
													type="button"
													onclick={() => (expandedRequest = null)}
													class="flex-1 border border-paper-border py-1 text-xs text-ink-muted hover:border-ink-faint"
												>
													Cancel
												</button>
												<button
													type="submit"
													class="flex-1 border border-ink bg-ink py-1 text-xs text-paper hover:bg-ink/90"
												>
													Send
												</button>
											</div>
										</form>
									{:else}
										<button
											type="button"
											onclick={() => (expandedRequest = book.userBookId)}
											class="border border-ink bg-ink px-3 py-1 text-xs text-paper hover:bg-ink/90"
										>
											Request
										</button>
									{/if}
								{/if}
							{:else}
								<span class="text-xs text-ink-faint">lent</span>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
