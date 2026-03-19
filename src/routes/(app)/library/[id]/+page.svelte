<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { ArrowLeft, Tag, Trash, Star } from 'phosphor-svelte';
	import BookCard from '$lib/components/BookCard.svelte';
	import TagCombobox from '$lib/components/TagCombobox.svelte';
	import StarRating from '$lib/components/StarRating.svelte';

	let { data, form } = $props();
	let { book, userTags, myReview, reviews, reviewStats } = $derived(data);

	let assignedTagIds = $derived(new Set(book.tags.map((t: { id: string }) => t.id)));
	let availableTags = $derived(userTags.filter((t: { id: string }) => !assignedTagIds.has(t.id)));

	let isAvailable = $state(book.isAvailable);
	let notes = $state(book.notes ?? '');
	let savedOk = $state(false);
	let savedTimer: ReturnType<typeof setTimeout>;

	// Reseña
	let reviewRating = $state(myReview?.rating ?? 0);
	let reviewBody = $state(myReview?.body ?? '');
	let reviewSavedOk = $state(false);
	let reviewSavedTimer: ReturnType<typeof setTimeout>;
	let showReviewForm = $state(!!myReview || false);

	const DESCRIPTION_LIMIT = 300;
	let descriptionExpanded = $state(false);
	let descriptionTruncated = $derived(
		book.description && book.description.length > DESCRIPTION_LIMIT
	);
	let descriptionVisible = $derived(
		book.description
			? descriptionExpanded
				? book.description
				: book.description.slice(0, DESCRIPTION_LIMIT)
			: null
	);

	$effect(() => {
		if (form?.removed) goto('/library');
		if (form?.success) {
			savedOk = true;
			clearTimeout(savedTimer);
			savedTimer = setTimeout(() => (savedOk = false), 2500);
		}
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

<div class="mx-auto max-w-lg space-y-10">
	{#if form?.error}
		<p class="border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
			{form.error}
		</p>
	{/if}

	<a
		href="/library"
		class="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-900"
	>
		<ArrowLeft size={16} /> Mi biblioteca
	</a>

	<!-- Libro -->
	<BookCard
		title={book.title}
		authors={book.authors}
		coverUrl={book.coverUrl}
		publishYear={book.publishYear}
		isAvailable={book.isAvailable}
		openLibraryId={book.bookId}
		variant="detail"
	/>

	<!-- Descripción -->
	{#if descriptionVisible}
		<div class="space-y-2">
			<span class="block text-xs font-medium tracking-widest text-neutral-500 uppercase"
				>Sinopsis</span
			>
			<p class="text-sm leading-relaxed text-neutral-600">
				{descriptionVisible}{#if descriptionTruncated && !descriptionExpanded}…{/if}
			</p>
			{#if descriptionTruncated}
				<button
					type="button"
					onclick={() => (descriptionExpanded = !descriptionExpanded)}
					class="text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-700"
				>
					{descriptionExpanded ? 'Leer menos' : 'Leer más'}
				</button>
			{/if}
		</div>
	{/if}

	<!-- Notas y disponibilidad -->
	<form method="POST" action="?/update" use:enhance class="space-y-5">
		<div>
			<label
				for="notes"
				class="block text-xs font-medium tracking-widest text-neutral-500 uppercase"
			>
				Notas
			</label>
			<textarea
				id="notes"
				name="notes"
				bind:value={notes}
				rows="3"
				placeholder="Edición, estado del libro..."
				class="mt-1.5 w-full border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-900 focus:ring-0"
			></textarea>
		</div>

		<label class="flex cursor-pointer items-center gap-3">
			<div class="relative">
				<input
					type="checkbox"
					name="isAvailable"
					value="true"
					bind:checked={isAvailable}
					class="sr-only"
				/>
				<div
					class="h-5 w-9 rounded-full border-2 transition-colors
					{isAvailable ? 'border-neutral-900 bg-neutral-900' : 'border-neutral-300 bg-white'}"
				>
					<div
						class="h-3 w-3 translate-x-0.5 translate-y-0.5 rounded-full transition-transform
						{isAvailable ? 'translate-x-4 bg-white' : 'bg-neutral-300'}"
					></div>
				</div>
			</div>
			<span class="text-sm text-neutral-700">Disponible para préstamo</span>
		</label>

		<div class="flex items-center gap-3">
			<button
				type="submit"
				class="border border-neutral-900 bg-neutral-900 px-5 py-2 text-sm text-white hover:bg-neutral-800"
			>
				Guardar
			</button>
			{#if savedOk}
				<span class="text-xs text-neutral-400">Guardado</span>
			{/if}
		</div>
	</form>

	<!-- Etiquetas -->
	<div class="space-y-4 border-t border-neutral-100 pt-6">
		<div class="flex items-center gap-2">
			<Tag size={16} class="text-neutral-400" />
			<span class="text-xs font-medium tracking-widest text-neutral-500 uppercase">Etiquetas</span>
		</div>

		<!-- Asignadas -->
		{#if book.tags.length > 0}
			<div class="flex flex-wrap gap-2">
				{#each book.tags as tag (tag.id)}
					<form method="POST" action="?/removeTag" use:enhance class="inline">
						<input type="hidden" name="tagId" value={tag.id} />
						<button
							type="submit"
							class="group flex items-center gap-1.5 border px-3 py-1 text-xs transition-colors hover:border-red-200 hover:text-red-500"
							style={tag.color
								? `border-color: ${tag.color}44; color: ${tag.color}`
								: 'border-color: #e5e5e5; color: #3d3d3d'}
						>
							{tag.name}
							<span class="opacity-0 group-hover:opacity-100">×</span>
						</button>
					</form>
				{/each}
			</div>
		{/if}

		<!-- Combobox: buscar etiqueta existente o crear nueva -->
		<TagCombobox {availableTags} />
	</div>

	<!-- Reseñas -->
	<div class="space-y-6 border-t border-neutral-100 pt-6">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<Star size={16} class="text-neutral-400" />
				<span class="text-xs font-medium tracking-widest text-neutral-500 uppercase">Reseñas</span>
			</div>
			<div class="flex items-center gap-3">
				{#if reviewStats.totalReviews > 0}
					<div class="flex items-center gap-2">
						<StarRating value={Math.round(reviewStats.averageRating ?? 0)} readonly size={16} />
						<span class="text-xs text-neutral-500">
							{reviewStats.averageRating?.toFixed(1)} · {reviewStats.totalReviews}
							{reviewStats.totalReviews === 1 ? 'reseña' : 'reseñas'}
						</span>
					</div>
				{/if}
				<a
					href="/books/{book.bookId}/reviews"
					class="text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-900"
				>
					Ver todas →
				</a>
			</div>
		</div>

		<!-- Mi reseña -->
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
				<p class="text-xs font-medium tracking-widest text-neutral-500 uppercase">Tu reseña</p>

				{#if form?.reviewError}
					<p class="text-xs text-red-600">{form.reviewError}</p>
				{/if}

				<form method="POST" action="?/saveReview" use:enhance class="space-y-3">
					<div>
						<StarRating bind:value={reviewRating} name="rating" size={24} />
					</div>
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

		<!-- Reseñas de otros usuarios -->
		{#if reviews.length > 0}
			<div class="space-y-4">
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
		{:else if !myReview}
			<p class="text-xs text-neutral-400">Aún no hay reseñas para este libro.</p>
		{/if}
	</div>

	<!-- Eliminar -->
	<div class="border-t border-neutral-100 pt-4">
		<form
			method="POST"
			action="?/remove"
			use:enhance
			onsubmit={(e) => {
				if (!confirm('¿Eliminar este libro de tu biblioteca?')) e.preventDefault();
			}}
		>
			<button
				type="submit"
				class="flex items-center gap-1.5 text-sm text-neutral-300 hover:text-red-500"
			>
				<Trash size={14} /> Eliminar de mi biblioteca
			</button>
		</form>
	</div>
</div>
