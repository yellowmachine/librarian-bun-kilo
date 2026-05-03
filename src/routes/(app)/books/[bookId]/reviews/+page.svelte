<script lang="ts">
	import { enhance, applyAction, deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { ArrowLeft, Star } from 'phosphor-svelte';
	import StarRating from '$lib/components/StarRating.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	let confirmMessage = $state('');
	let pendingForm = $state<HTMLFormElement | null>(null);

	function openConfirm(message: string, formEl: HTMLFormElement): void {
		confirmMessage = message;
		pendingForm = formEl;
	}

	async function submitConfirmed() {
		if (!pendingForm) return;
		const formEl = pendingForm;
		pendingForm = null;
		const response = await fetch(formEl.action, {
			method: 'POST',
			body: new FormData(formEl),
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await response.text());
		await applyAction(result);
		invalidateAll();
	}

	let { data, form } = $props();
	let { book, myReview, reviews, reviewStats } = $derived(data);

	let reviewRating = $state(myReview?.rating ?? 0);
	let reviewBody = $state(myReview?.body ?? '');
	let reviewSavedOk = $state(false);
	let reviewSavedTimer: ReturnType<typeof setTimeout>;
	let showReviewForm = $state(!!myReview);

	$effect(() => {
		if (form?.reviewSaved) {
			reviewSavedOk = true;
			clearTimeout(reviewSavedTimer);
			reviewSavedTimer = setTimeout(() => (reviewSavedOk = false), 2500);
		}
		if (form?.reviewDeleted) {
			reviewRating = 0;
			reviewBody = '';
			showReviewForm = false;
		}
	});

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('es-ES', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
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
				{#if reviewStats.totalReviews > 0}
					<div class="mt-2 flex items-center gap-2">
						<StarRating value={Math.round(reviewStats.averageRating ?? 0)} readonly size={16} />
						<span class="text-sm text-ink-muted">
							{reviewStats.averageRating?.toFixed(1)}
							<span class="text-ink-faint">·</span>
							{reviewStats.totalReviews}
							{reviewStats.totalReviews === 1 ? 'review' : 'reviews'}
						</span>
					</div>
				{:else}
					<p class="mt-2 text-xs text-ink-faint">There are no reviews for this book yet.</p>
				{/if}
			</div>
		</div>
	</div>

	<!-- Mi reseña -->
	<div class="space-y-4 border-t border-paper-border pt-6">
		<div class="flex items-center gap-2">
			<Star size={15} class="text-ink-faint" />
			<span class="text-xs font-medium tracking-widest text-ink-muted uppercase">Your review</span>
		</div>

		{#if !showReviewForm && !myReview}
			<button
				type="button"
				onclick={() => (showReviewForm = true)}
				class="text-sm text-ink-faint underline underline-offset-2 hover:text-ink"
			>
				Write a review
			</button>
		{/if}

		{#if showReviewForm || myReview}
			<div class="space-y-3 border border-paper-border p-4">
				{#if form?.reviewError}
					<p class="text-xs text-red-600">{form.reviewError}</p>
				{/if}

				<form method="POST" action="?/saveReview" use:enhance class="space-y-3">
					<StarRating bind:value={reviewRating} name="rating" size={24} />
					<textarea
						name="body"
						bind:value={reviewBody}
						rows="3"
						placeholder="Tell us what you thought… (optional)"
						class="w-full border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
					></textarea>
					<div class="flex items-center gap-3">
						<button
							type="submit"
							disabled={reviewRating === 0}
							class="border border-ink bg-ink px-4 py-1.5 text-sm text-paper hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
						>
							{myReview ? 'Actualizar' : 'Publicar'}
						</button>
						{#if reviewSavedOk}
							<span class="text-xs text-ink-faint">Saved</span>
						{/if}
						{#if !myReview}
							<button
								type="button"
								onclick={() => (showReviewForm = false)}
								class="text-sm text-ink-faint hover:text-ink-muted"
							>
								Cancel
							</button>
						{/if}
					</div>
				</form>

				{#if myReview}
					<form
						method="POST"
						action="?/deleteReview"
						onsubmit={(e) => {
							e.preventDefault();
							openConfirm('Remove your review?', e.currentTarget as HTMLFormElement);
						}}
					>
						<button type="submit" class="text-xs text-ink-faint hover:text-red-500">
							Remove review
						</button>
					</form>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Reseñas de otros -->
	{#if reviews.filter((r) => r.userId !== myReview?.userId).length > 0}
		<div class="space-y-4 border-t border-paper-border pt-6">
			<span class="text-xs font-medium tracking-widest text-ink-muted uppercase">Other reviews</span
			>
			{#each reviews as review (review.id)}
				{#if review.userId !== myReview?.userId}
					<div class="space-y-1.5 border-b border-paper-ui pb-4 last:border-0">
						<div class="flex items-center justify-between">
							<span class="text-xs font-medium text-ink-muted">{review.userName}</span>
							<span class="text-xs text-ink-faint">{formatDate(review.createdAt)}</span>
						</div>
						<StarRating value={review.rating} readonly size={14} />
						{#if review.body}
							<p class="text-sm leading-relaxed text-ink-muted">{review.body}</p>
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>

{#if pendingForm}
	<ConfirmDialog
		message={confirmMessage}
		onconfirm={submitConfirmed}
		oncancel={() => {
			pendingForm = null;
		}}
	/>
{/if}
