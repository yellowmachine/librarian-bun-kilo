<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { ArrowLeft, Tag, Plus, Trash } from 'phosphor-svelte';
	import BookCard from '$lib/components/BookCard.svelte';

	let { data, form } = $props();
	let { book, userTags } = $derived(data);

	let assignedTagIds = $derived(new Set(book.tags.map((t: { id: string }) => t.id)));
	let availableTags = $derived(userTags.filter((t: { id: string }) => !assignedTagIds.has(t.id)));

	let showNewTagForm = $state(false);
	let newTagName = $state('');
	let newTagColor = $state('#0a0a0a');
	let isAvailable = $state(book.isAvailable);
	let notes = $state(book.notes ?? '');

	$effect(() => {
		if (form?.removed) goto('/library');
	});
</script>

<div class="mx-auto max-w-lg space-y-10">
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

		<button
			type="submit"
			class="border border-neutral-900 bg-neutral-900 px-5 py-2 text-sm text-white hover:bg-neutral-800"
		>
			Guardar
		</button>
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

		<!-- Disponibles para añadir -->
		{#if availableTags.length > 0}
			<div class="flex flex-wrap gap-2">
				{#each availableTags as tag (tag.id)}
					<form method="POST" action="?/addTag" use:enhance class="inline">
						<input type="hidden" name="tagId" value={tag.id} />
						<button
							type="submit"
							class="border border-dashed border-neutral-200 px-3 py-1 text-xs text-neutral-400 transition-colors hover:border-neutral-400 hover:text-neutral-700"
						>
							+ {tag.name}
						</button>
					</form>
				{/each}
			</div>
		{/if}

		<!-- Nueva etiqueta -->
		{#if showNewTagForm}
			<form method="POST" action="?/createTag" use:enhance class="flex items-center gap-2">
				<input
					type="text"
					name="name"
					bind:value={newTagName}
					placeholder="Nombre"
					autofocus
					required
					class="min-w-0 flex-1 border border-neutral-200 px-3 py-1.5 text-sm focus:border-neutral-900 focus:ring-0"
				/>
				<input
					type="color"
					name="color"
					bind:value={newTagColor}
					class="h-8 w-8 cursor-pointer rounded-none border border-neutral-200 p-0.5"
				/>
				<button
					type="submit"
					class="border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-800"
				>
					Crear
				</button>
				<button
					type="button"
					onclick={() => (showNewTagForm = false)}
					class="text-neutral-300 hover:text-neutral-600">×</button
				>
			</form>
		{:else}
			<button
				onclick={() => (showNewTagForm = true)}
				class="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-700"
			>
				<Plus size={12} /> Nueva etiqueta
			</button>
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
