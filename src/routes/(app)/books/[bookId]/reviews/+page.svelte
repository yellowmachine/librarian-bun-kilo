<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft, Star } from 'phosphor-svelte';
	import StarRating from '$lib/components/StarRating.svelte';

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
			class="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-900"
		>
			<ArrowLeft size={16} /> Mi biblioteca
		</a>
		<div class="mt-4 flex items-start gap-4">
			{#if book.coverUrl}
				<img src={book.coverUrl} alt={book.title} class="h-20 w-14 flex-shrink-0 object-cover" />
			{/if}
			<div class="min-w-0">
				<h1 class="font-serif text-2xl leading-tight font-normal text-neutral-900">{book.title}</h1>
				{#if book.authors && book.authors.length > 0}
					<p class="mt-1 text-sm text-neutral-500">{book.authors.join(', ')}</p>
				{/if}
				{#if reviewStats.totalReviews > 0}
					<div class="mt-2 flex items-center gap-2">
						<StarRating value={Math.round(reviewStats.averageRating ?? 0)} readonly size={16} />
						<span class="text-sm text-neutral-500">
							{reviewStats.averageRating?.toFixed(1)}
							<span class="text-neutral-300">·</span>
							{reviewStats.totalReviews}
							{reviewStats.totalReviews === 1 ? 'reseña' : 'reseñas'}
						</span>
					</div>
				{:else}
					<p class="mt-2 text-xs text-neutral-400">Sin reseñas todavía</p>
				{/if}
			</div>
		</div>
	</div>

	<!-- Mi reseña -->
	<div class="space-y-4 border-t border-neutral-100 pt-6">
		<div class="flex items-center gap-2">
			<Star size={15} class="text-neutral-400" />
			<span class="text-xs font-medium tracking-widest text-neutral-500 uppercase">Tu reseña</span>
		</div>

		{#if !showReviewForm && !myReview}
			<button
				type="button"
				onclick={() => (showReviewForm = true)}
				class="text-sm text-neutral-400 underline underline-offset-2 hover:text-neutral-900"
			>
				Escribir una reseña
			</button>
		{/if}

		{#if showReviewForm || myReview}
			<div class="space-y-3 border border-neutral-100 p-4">
				{#if form?.reviewError}
					<p class="text-xs text-red-600">{form.reviewError}</p>
				{/if}

				<form method="POST" action="?/saveReview" use:enhance class="space-y-3">
					<StarRating bind:value={reviewRating} name="rating" size={24} />
					<textarea
						name="body"
						bind:value={reviewBody}
						rows="3"
						placeholder="Cuéntanos qué te pareció... (opcional)"
						class="w-full border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-900 focus:ring-0"
					></textarea>
					<div class="flex items-center gap-3">
						<button
							type="submit"
							disabled={reviewRating === 0}
							class="border border-neutral-900 bg-neutral-900 px-4 py-1.5 text-sm text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
						>
							{myReview ? 'Actualizar' : 'Publicar'}
						</button>
						{#if reviewSavedOk}
							<span class="text-xs text-neutral-400">Guardado</span>
						{/if}
						{#if !myReview}
							<button
								type="button"
								onclick={() => (showReviewForm = false)}
								class="text-sm text-neutral-300 hover:text-neutral-600"
							>
								Cancelar
							</button>
						{/if}
					</div>
				</form>

				{#if myReview}
					<form
						method="POST"
						action="?/deleteReview"
						use:enhance
						onsubmit={(e) => {
							if (!confirm('¿Eliminar tu reseña?')) e.preventDefault();
						}}
					>
						<button type="submit" class="text-xs text-neutral-300 hover:text-red-500">
							Eliminar reseña
						</button>
					</form>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Reseñas de otros -->
	{#if reviews.filter((r) => r.userId !== myReview?.userId).length > 0}
		<div class="space-y-4 border-t border-neutral-100 pt-6">
			<span class="text-xs font-medium tracking-widest text-neutral-500 uppercase"
				>Otras reseñas</span
			>
			{#each reviews as review (review.id)}
				{#if review.userId !== myReview?.userId}
					<div class="space-y-1.5 border-b border-neutral-50 pb-4 last:border-0">
						<div class="flex items-center justify-between">
							<span class="text-xs font-medium text-neutral-700">{review.userName}</span>
							<span class="text-xs text-neutral-400">{formatDate(review.createdAt)}</span>
						</div>
						<StarRating value={review.rating} readonly size={14} />
						{#if review.body}
							<p class="text-sm leading-relaxed text-neutral-600">{review.body}</p>
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>
