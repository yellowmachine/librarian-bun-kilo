<script lang="ts">
	import { enhance, applyAction, deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { ArrowLeft, Tag, Trash, Star, PencilSimple } from 'phosphor-svelte';
	import BookCard from '$lib/components/BookCard.svelte';
	import TagCombobox from '$lib/components/TagCombobox.svelte';
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

	// Edit form state (manual books only)
	let editOpen = $state(false);
	let editTitle = $state(book.title);
	let editAuthors = $state((book.authors as string[]).join('\n'));
	let editIsbn = $state(book.isbn ?? '');
	let editPublishYear = $state(book.publishYear?.toString() ?? '');
	let editDescription = $state(book.description ?? '');

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
		if (form?.success) {
			savedOk = true;
			clearTimeout(savedTimer);
			savedTimer = setTimeout(() => (savedOk = false), 2500);
		}
		if (form?.editSaved) {
			editOpen = false;
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
		class="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink"
	>
		<ArrowLeft size={16} /> Mi biblioteca
	</a>

	<!-- Libro -->
	<div class="flex items-start justify-between gap-4">
		<BookCard
			title={book.title}
			authors={book.authors}
			coverUrl={book.coverUrl}
			publishYear={book.publishYear}
			isAvailable={book.isAvailable}
			variant="detail"
		/>
		{#if !book.bookId}
			<button
				type="button"
				onclick={() => (editOpen = !editOpen)}
				class="mt-1 flex shrink-0 items-center gap-1 text-xs text-ink-faint hover:text-ink"
			>
				<PencilSimple size={13} />
				{editOpen ? 'Cancel' : 'Edit'}
			</button>
		{/if}
	</div>

	<!-- Edit form (manual books only) -->
	{#if editOpen && !book.bookId}
		<form method="POST" action="?/editManual" use:enhance class="space-y-4 border border-paper-border p-4">
			{#if form?.editError}
				<p class="text-xs text-red-600">{form.editError}</p>
			{/if}
			<div>
				<label for="edit-title" class="block text-xs font-medium tracking-widest text-ink-muted uppercase">Title *</label>
				<input id="edit-title" name="title" type="text" required bind:value={editTitle}
					class="mt-1.5 w-full border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0" />
			</div>
			<div>
				<label for="edit-authors" class="block text-xs font-medium tracking-widest text-ink-muted uppercase">
					Authors <span class="tracking-normal normal-case text-ink-faint">(one per line)</span>
				</label>
				<textarea id="edit-authors" name="authors" rows="2" bind:value={editAuthors}
					class="mt-1.5 w-full resize-none border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"></textarea>
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label for="edit-isbn" class="block text-xs font-medium tracking-widest text-ink-muted uppercase">ISBN</label>
					<input id="edit-isbn" name="isbn" type="text" bind:value={editIsbn}
						class="mt-1.5 w-full border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0" />
				</div>
				<div>
					<label for="edit-year" class="block text-xs font-medium tracking-widest text-ink-muted uppercase">Year</label>
					<input id="edit-year" name="publishYear" type="number" min="0" max="9999" bind:value={editPublishYear}
						class="mt-1.5 w-full border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0" />
				</div>
			</div>
			<div>
				<label for="edit-desc" class="block text-xs font-medium tracking-widest text-ink-muted uppercase">Description</label>
				<textarea id="edit-desc" name="description" rows="4" bind:value={editDescription}
					class="mt-1.5 w-full resize-none border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"></textarea>
			</div>
			<button type="submit" class="border border-ink bg-ink px-5 py-2 text-sm text-paper hover:bg-ink/90">
				Save changes
			</button>
		</form>
	{/if}

	<!-- Descripción -->
	{#if descriptionVisible}
		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<span class="text-xs font-medium tracking-widest text-ink-muted uppercase">Synopsis</span>
				{#if book.bookId}
					<form method="POST" action="?/updateDescription" use:enhance>
						<button type="submit" class="text-xs text-ink-faint hover:text-ink-muted">
							↻ Update from OpenLibrary
						</button>
					</form>
				{/if}
			</div>
			<p class="text-sm leading-relaxed text-ink-muted">
				{descriptionVisible}{#if descriptionTruncated && !descriptionExpanded}…{/if}
			</p>
			{#if descriptionTruncated}
				<button
					type="button"
					onclick={() => (descriptionExpanded = !descriptionExpanded)}
					class="text-xs text-ink-faint underline underline-offset-2 hover:text-ink-muted"
				>
					{descriptionExpanded ? 'Leer menos' : 'Leer más'}
				</button>
			{/if}
		</div>
	{:else if book.bookId}
		<div class="flex items-center justify-between">
			<span class="text-xs text-ink-faint">No synopsis available.</span>
			<form method="POST" action="?/updateDescription" use:enhance>
				<button type="submit" class="text-xs text-ink-faint hover:text-ink-muted">
					↻ Fetch from OpenLibrary
				</button>
			</form>
		</div>
	{/if}

	<!-- OpenLibrary link -->
	{#if book.bookId}
		<a
			href="https://openlibrary.org/works/{book.bookId}"
			target="_blank"
			rel="noopener noreferrer"
			class="inline-flex items-center gap-1 text-xs text-ink-faint underline underline-offset-2 hover:text-ink-muted"
		>
			View on Open Library ↗
		</a>
	{/if}

	<!-- Notas y disponibilidad -->
	<form method="POST" action="?/update" use:enhance class="space-y-5">
		<div>
			<label
				for="notes"
				class="block text-xs font-medium tracking-widest text-ink-muted uppercase"
			>
				Notes
			</label>
			<textarea
				id="notes"
				name="notes"
				bind:value={notes}
				rows="3"
				placeholder="Edition, book condition..."
				class="mt-1.5 w-full border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
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
					{isAvailable ? 'border-ink bg-ink' : 'border-paper-border bg-paper'}"
				>
					<div
						class="h-3 w-3 translate-x-0.5 translate-y-0.5 rounded-full transition-transform
						{isAvailable ? 'translate-x-4 bg-paper' : 'bg-paper-border'}"
					></div>
				</div>
			</div>
			<span class="text-sm text-ink-muted">Available for loan</span>
		</label>

		<div class="flex items-center gap-3">
			<button
				type="submit"
				class="border border-ink bg-ink px-5 py-2 text-sm text-paper hover:bg-ink/90"
			>
				Save
			</button>
			{#if savedOk}
				<span class="text-xs text-ink-faint">Saved</span>
			{/if}
		</div>
	</form>

	<!-- Etiquetas -->
	<div class="space-y-4 border-t border-paper-border pt-6">
		<div class="flex items-center gap-2">
			<Tag size={16} class="text-ink-faint" />
			<span class="text-xs font-medium tracking-widest text-ink-muted uppercase">Tags</span>
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
								: 'border-color: #e8e2da; color: #3d3d3d'}
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

	<!-- Reseñas (solo libros de OpenLibrary) -->
	{#if book.bookId}
	<div class="space-y-6 border-t border-paper-border pt-6">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<Star size={16} class="text-ink-faint" />
				<span class="text-xs font-medium tracking-widest text-ink-muted uppercase">Reviews</span>
			</div>
			<div class="flex items-center gap-3">
				{#if reviewStats && reviewStats.totalReviews > 0}
					<div class="flex items-center gap-2">
						<StarRating value={Math.round(reviewStats.averageRating ?? 0)} readonly size={16} />
						<span class="text-xs text-ink-muted">
							{reviewStats.averageRating?.toFixed(1)} · {reviewStats.totalReviews}
							{reviewStats.totalReviews === 1 ? 'reseña' : 'reseñas'}
						</span>
					</div>
				{/if}
				<a
					href="/books/{book.bookId}/reviews"
					class="text-xs text-ink-faint underline underline-offset-2 hover:text-ink"
				>
					See all →
				</a>
			</div>
		</div>

		<!-- Mi reseña -->
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
				<p class="text-xs font-medium tracking-widest text-ink-muted uppercase">Your review</p>

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
						placeholder="Tell us what you thought… (optional)"
						class="w-full border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
					></textarea>
					<div class="flex items-center gap-3">
						<button
							type="submit"
							disabled={reviewRating === 0}
							class="border border-ink bg-ink px-4 py-1.5 text-sm text-paper hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
						>
							{myReview ? 'Update' : 'Publish'}
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
						onsubmit={(e) => { e.preventDefault(); openConfirm('Remove your review?', e.currentTarget as HTMLFormElement); }}
					>
						<button type="submit" class="text-xs text-ink-faint hover:text-red-500">
							Remove review
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
		{:else if !myReview}
			<p class="text-xs text-ink-faint">There are no reviews for this book yet.</p>
		{/if}
	</div>
	{/if}

	<!-- Eliminar -->
	<div class="border-t border-paper-border pt-4">
		<form
			method="POST"
			action="?/remove"
			onsubmit={(e) => { e.preventDefault(); openConfirm('Remove this book from your library?', e.currentTarget as HTMLFormElement); }}
		>
			<button
				type="submit"
				class="flex items-center gap-1.5 text-sm text-ink-faint hover:text-red-500"
			>
				<Trash size={14} /> Remove from my library
			</button>
		</form>
	</div>
</div>

{#if pendingForm}
	<ConfirmDialog
		message={confirmMessage}
		onconfirm={submitConfirmed}
		oncancel={() => { pendingForm = null; }}
	/>
{/if}
