<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { ArrowLeft, Tag, Trash } from 'phosphor-svelte';
	import BookCard from '$lib/components/BookCard.svelte';
	import TagCombobox from '$lib/components/TagCombobox.svelte';

	let { data, form } = $props();
	let { book, userTags } = $derived(data);

	let assignedTagIds = $derived(new Set(book.tags.map((t: { id: string }) => t.id)));
	let availableTags = $derived(userTags.filter((t: { id: string }) => !assignedTagIds.has(t.id)));

	let isAvailable = $state(book.isAvailable);
	let notes = $state(book.notes ?? '');
	let savedOk = $state(false);
	let savedTimer: ReturnType<typeof setTimeout>;

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
	});
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
