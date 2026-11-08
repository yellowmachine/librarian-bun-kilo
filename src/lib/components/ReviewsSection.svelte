<script lang="ts">
	// Reseñas de una obra (libro o película): media, la propia (escribir,
	// editar, borrar) y las de los demás. Manda los formularios a las acciones
	// ?/saveReview y ?/deleteReview de la página que lo usa.
	import { enhance } from '$app/forms';
	import { Star } from 'phosphor-svelte';
	import StarRating from './StarRating.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';

	type Review = {
		id: string;
		userId: string;
		userName: string;
		rating: number;
		body: string | null;
		createdAt: Date | string;
	};

	interface Props {
		myReview: Review | null;
		reviews: Review[];
		stats: { averageRating: number | null; totalReviews: number };
		/** El `form` de la página: reviewError / reviewSaved */
		form?: { reviewError?: string; reviewSaved?: boolean } | null;
		emptyText?: string;
		/** Enlace «See all →» a una página con todas las reseñas */
		allHref?: string;
	}

	let {
		myReview,
		reviews,
		stats,
		form = null,
		emptyText = 'No reviews yet.',
		allHref
	}: Props = $props();

	// svelte-ignore state_referenced_locally
	let rating = $state(myReview?.rating ?? 0);
	// svelte-ignore state_referenced_locally
	let body = $state(myReview?.body ?? '');
	let writing = $state(false);
	let confirmingDelete = $state(false);
	let deleteForm = $state<HTMLFormElement>();

	const others = $derived(reviews.filter((r) => r.userId !== myReview?.userId));

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('es-ES', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div class="space-y-6 border-t border-paper-border pt-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Star size={16} class="text-ink-faint" />
			<span class="text-xs font-medium tracking-widest text-ink-muted uppercase">Reviews</span>
		</div>
		<div class="flex items-center gap-3">
			{#if stats.totalReviews > 0}
				<div class="flex items-center gap-2">
					<StarRating value={Math.round(stats.averageRating ?? 0)} readonly size={16} />
					<span class="text-xs text-ink-muted">
						{stats.averageRating?.toFixed(1)} · {stats.totalReviews}
						{stats.totalReviews === 1 ? 'review' : 'reviews'}
					</span>
				</div>
			{/if}
			{#if allHref}
				<a href={allHref} class="text-xs link-action">See all →</a>
			{/if}
		</div>
	</div>

	{#if !writing && !myReview}
		<button type="button" onclick={() => (writing = true)} class="text-sm link-action">
			Write a review
		</button>
	{:else}
		<div class="space-y-3 border border-paper-border p-4">
			<p class="text-xs font-medium tracking-widest text-ink-muted uppercase">Your review</p>
			{#if form?.reviewError}
				<p class="text-xs text-red-700">{form.reviewError}</p>
			{/if}
			<form
				method="POST"
				action="?/saveReview"
				use:enhance={() =>
					async ({ update }) => {
						await update({ reset: false });
					}}
				class="space-y-3"
			>
				<StarRating bind:value={rating} name="rating" size={24} />
				<textarea
					name="body"
					bind:value={body}
					rows="3"
					maxlength="5000"
					placeholder="What did you think? (optional)"
					class="w-full border border-paper-border px-3 py-2 text-sm focus:border-brown-600 focus:ring-0"
				></textarea>
				<div class="flex items-center gap-3">
					<button
						type="submit"
						disabled={rating === 0}
						class="border btn-primary px-4 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
					>
						{myReview ? 'Update' : 'Publish'}
					</button>
					{#if form?.reviewSaved}<span class="text-xs text-ink-faint">Saved</span>{/if}
					{#if !myReview}
						<button
							type="button"
							onclick={() => (writing = false)}
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
					bind:this={deleteForm}
					use:enhance={() =>
						async ({ update }) => {
							await update();
							rating = 0;
							body = '';
							writing = false;
						}}
				>
					<button
						type="button"
						onclick={() => (confirmingDelete = true)}
						class="text-xs text-ink-faint hover:text-red-700"
					>
						Remove review
					</button>
				</form>
			{/if}
		</div>
	{/if}

	{#if others.length > 0}
		<div class="space-y-4">
			{#each others as review (review.id)}
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
			{/each}
		</div>
	{:else if !myReview}
		<p class="text-xs text-ink-faint">{emptyText}</p>
	{/if}
</div>

{#if confirmingDelete}
	<ConfirmDialog
		message="Remove your review?"
		onconfirm={() => {
			confirmingDelete = false;
			deleteForm?.requestSubmit();
		}}
		oncancel={() => (confirmingDelete = false)}
	/>
{/if}
