<script lang="ts">
	import { Plus, Trash } from 'phosphor-svelte';
	import AuthorCombobox from './AuthorCombobox.svelte';

	// Lista de autores, un AuthorCombobox por autor con botones para añadir y
	// quitar. Con `name`, cada autor no vacío se envía como un campo oculto
	// repetido (leer con formData.getAll(name) en el servidor).

	let {
		authors = $bindable(['']),
		name
	}: {
		authors: string[];
		name?: string;
	} = $props();

	function addAuthorField() {
		authors = [...authors, ''];
	}

	function removeAuthorField(i: number) {
		authors = authors.filter((_, idx) => idx !== i);
		if (authors.length === 0) authors = [''];
	}
</script>

<div class="mt-1.5 space-y-2">
	{#each authors as _, i (i)}
		<div class="flex gap-2">
			<AuthorCombobox bind:value={authors[i]} class="flex-1" />
			{#if authors.length > 1}
				<button
					type="button"
					aria-label="Remove author"
					onclick={() => removeAuthorField(i)}
					class="flex items-center justify-center border border-paper-border px-2.5 text-ink-faint hover:border-ink-faint hover:text-ink"
				>
					<Trash size={14} />
				</button>
			{/if}
		</div>
	{/each}
	<button
		type="button"
		onclick={addAuthorField}
		class="flex items-center gap-1.5 text-xs text-ink-faint hover:text-ink-muted"
	>
		<Plus size={12} /> Add author
	</button>
	{#if name}
		{#each authors as author, i (i)}
			{#if author.trim()}
				<input type="hidden" {name} value={author.trim()} />
			{/if}
		{/each}
	{/if}
</div>
