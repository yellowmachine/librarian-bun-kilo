<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft, BookOpen } from 'phosphor-svelte';
	import type { BorrowableBook } from '$lib/server/loans';

	let { data, form } = $props();
	const book = $derived(data.book as BorrowableBook);
</script>

<div class="mx-auto max-w-md space-y-10">
	<a href="/library" class="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink">
		<ArrowLeft size={16} /> Library
	</a>

	{#if form?.error}
		<p class="border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{form.error}</p>
	{/if}

	<!-- Libro -->
	<div class="flex gap-5">
		{#if book.coverUrl}
			<img
				src={book.coverUrl}
				alt={book.title}
				class="h-32 w-[88px] flex-shrink-0 object-cover shadow-sm"
			/>
		{:else}
			<div class="flex h-32 w-[88px] flex-shrink-0 items-center justify-center bg-paper-ui">
				<BookOpen size={28} weight="thin" class="text-ink-faint" />
			</div>
		{/if}
		<div class="min-w-0 space-y-2 pt-1">
			<h1 class="font-serif text-2xl leading-tight font-normal text-ink">{book.title}</h1>
			{#if book.authors.length > 0}
				<p class="text-sm text-ink-muted">{book.authors.join(', ')}</p>
			{/if}
			{#if book.publishYear}
				<p class="text-xs text-ink-faint">{book.publishYear}</p>
			{/if}
		</div>
	</div>

	<!-- Metadata -->
	<div class="grid grid-cols-2 gap-px border border-paper-border bg-paper-border">
		<div class="bg-paper px-4 py-4">
			<p class="text-xs font-medium tracking-widest text-ink-faint uppercase">Owner</p>
			<p class="mt-1 font-medium text-ink">{book.ownerName}</p>
		</div>
		<div class="bg-paper px-4 py-4">
			<p class="text-xs font-medium tracking-widest text-ink-faint uppercase">Availability</p>
			<p class="mt-1 font-medium {book.isAvailable ? 'text-ink' : 'text-ink-faint'}">
				{book.isAvailable ? 'Available' : 'On loan'}
			</p>
		</div>
	</div>

	<!-- Acción -->
	<div class="space-y-3 border-t border-paper-border pt-4">
		{#if book.existingLoanId}
			<!-- Ya tiene una solicitud/préstamo activo -->
			<p class="text-sm text-ink-muted">
				You already have a {book.existingLoanStatus === 'requested'
					? 'pending request'
					: book.existingLoanStatus === 'accepted'
						? 'loan accepted'
						: 'loan active'} for this book.
			</p>
			<a
				href="/loans/{book.existingLoanId}"
				class="block w-full border border-paper-border py-2.5 text-center text-sm text-ink-muted transition-colors hover:border-ink-faint hover:text-ink"
			>
				View loan →
			</a>
		{:else if !book.isAvailable}
			<!-- Libro no disponible, sin solicitud propia -->
			<p class="text-sm text-ink-faint">This book is currently on loan and not available.</p>
		{:else}
			<!-- Disponible, sin solicitud previa → formulario de solicitud -->
			<form method="POST" action="?/request" use:enhance class="space-y-3">
				<textarea
					name="notes"
					placeholder="Message to the owner (optional)"
					rows="3"
					class="w-full resize-none border border-paper-border px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:ring-0 focus:outline-none"
				></textarea>
				<button
					type="submit"
					class="w-full border border-ink bg-ink py-2.5 text-sm text-paper transition-colors hover:bg-ink/90"
				>
					Request loan
				</button>
			</form>
		{/if}
	</div>
</div>
