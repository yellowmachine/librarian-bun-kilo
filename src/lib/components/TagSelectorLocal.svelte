<script lang="ts">
	import { trackDropdownPlacement, type DropdownPlacement } from '$lib/dropdownPlacement';

	interface Tag {
		id: string;
		name: string;
		color: string | null;
	}

	interface NewTag {
		name: string;
		color: string | null;
	}

	let {
		availableTags,
		selectedTagIds = $bindable<string[]>([]),
		tagsToCreate = $bindable<NewTag[]>([])
	}: {
		availableTags: Tag[];
		selectedTagIds?: string[];
		tagsToCreate?: NewTag[];
	} = $props();

	const DEFAULT_COLOR = '#0a0a0a';

	let inputValue = $state('');
	let open = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);
	let containerEl = $state<HTMLDivElement | null>(null);

	let placement = $state<DropdownPlacement>({ direction: 'down', maxHeight: 256 });

	// Evita que la lista quede tapada por la barra inferior o el teclado en
	// mobile: se limita su altura al espacio visible y se abre hacia arriba
	// si abajo no cabe.
	$effect(() => {
		if (!open || !inputEl) return;
		return trackDropdownPlacement(inputEl, (p) => (placement = p));
	});

	let unselectedAvailable = $derived(availableTags.filter((t) => !selectedTagIds.includes(t.id)));

	let filtered = $derived(
		inputValue.trim().length === 0
			? unselectedAvailable
			: unselectedAvailable.filter((t) =>
					t.name.toLowerCase().includes(inputValue.trim().toLowerCase())
				)
	);

	let exactMatch = $derived(
		availableTags.find((t) => t.name.toLowerCase() === inputValue.trim().toLowerCase()) ||
			tagsToCreate.find((t) => t.name.toLowerCase() === inputValue.trim().toLowerCase())
	);

	let showCreate = $derived(inputValue.trim().length > 0 && !exactMatch);

	function selectTag(tag: Tag) {
		selectedTagIds = [...selectedTagIds, tag.id];
		inputValue = '';
		open = false;
	}

	function removeSelectedTag(tagId: string) {
		selectedTagIds = selectedTagIds.filter((id) => id !== tagId);
	}

	function removePendingTag(name: string) {
		tagsToCreate = tagsToCreate.filter((t) => t.name !== name);
	}

	// Crear y añadir en un solo paso: la etiqueta entra con el color por defecto, que se
	// puede cambiar después pulsando el punto de color de su chip.
	function createAndAdd() {
		const name = inputValue.trim();
		if (!name) return;
		tagsToCreate = [...tagsToCreate, { name, color: DEFAULT_COLOR }];
		inputValue = '';
		open = false;
	}

	function setPendingColor(name: string, color: string) {
		tagsToCreate = tagsToCreate.map((t) => (t.name === name ? { ...t, color } : t));
	}

	function handleBlur(e: FocusEvent) {
		if (containerEl && !containerEl.contains(e.relatedTarget as Node)) {
			open = false;
			inputValue = '';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
			inputEl?.blur();
		}
	}

	// Enter con un nombre nuevo lo crea y añade (y no envía el formulario del alta).
	function handleInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && showCreate) {
			e.preventDefault();
			createAndAdd();
		}
	}

	let selectedTagObjects = $derived(
		selectedTagIds.map((id) => availableTags.find((t) => t.id === id)).filter(Boolean) as Tag[]
	);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={containerEl} class="space-y-2" onfocusout={handleBlur} onkeydown={handleKeydown}>
	<!-- Chips de tags seleccionados -->
	{#if selectedTagObjects.length > 0 || tagsToCreate.length > 0}
		<div class="flex flex-wrap gap-1.5">
			{#each selectedTagObjects as tag (tag.id)}
				<span class="flex items-center gap-1 border border-paper-border px-2 py-0.5 text-xs">
					{#if tag.color}
						<span
							class="inline-block h-2 w-2 flex-shrink-0 rounded-full"
							style="background-color: {tag.color}"
						></span>
					{/if}
					{tag.name}
					<button
						type="button"
						onclick={() => removeSelectedTag(tag.id)}
						class="ml-0.5 text-ink-faint hover:text-ink"
						aria-label="Remove tag {tag.name}"
					>
						×
					</button>
				</span>
			{/each}
			{#each tagsToCreate as newTag (newTag.name)}
				<span
					class="flex items-center gap-1 border border-dashed border-paper-border px-2 py-0.5 text-xs text-ink-muted"
				>
					<label
						class="relative inline-block h-2.5 w-2.5 flex-shrink-0 cursor-pointer rounded-full border border-paper-border"
						style={newTag.color ? `background-color: ${newTag.color}` : ''}
						title="Change color"
					>
						<input
							type="color"
							value={newTag.color ?? DEFAULT_COLOR}
							oninput={(e) => setPendingColor(newTag.name, e.currentTarget.value)}
							class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
							aria-label="Color for tag {newTag.name}"
						/>
					</label>
					{newTag.name}
					<button
						type="button"
						onclick={() => removePendingTag(newTag.name)}
						class="ml-0.5 text-ink-faint hover:text-ink"
						aria-label="Remove tag {newTag.name}"
					>
						×
					</button>
				</span>
			{/each}
		</div>
	{/if}

	<!-- Input de búsqueda -->
	<div class="relative">
		<input
			bind:this={inputEl}
			bind:value={inputValue}
			type="text"
			placeholder="Search or create tag..."
			autocomplete="off"
			onfocus={() => (open = true)}
			oninput={() => (open = true)}
			onkeydown={handleInputKeydown}
			class="w-full border border-paper-border px-3 py-1.5 text-sm focus:border-brown-600 focus:ring-0"
		/>

		{#if open && (filtered.length > 0 || showCreate)}
			<ul
				class="absolute right-0 left-0 z-10 overflow-y-auto border border-paper-border bg-paper shadow-sm {placement.direction ===
				'up'
					? 'bottom-full mb-0.5'
					: 'top-full mt-0.5'}"
				style="max-height: {placement.maxHeight}px"
				role="listbox"
			>
				{#each filtered as tag (tag.id)}
					<li role="option" aria-selected="false">
						<button
							type="button"
							onclick={() => selectTag(tag)}
							class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-paper-ui"
						>
							{#if tag.color}
								<span
									class="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
									style="background-color: {tag.color}"
								></span>
							{/if}
							{tag.name}
						</button>
					</li>
				{/each}

				{#if showCreate}
					<li role="option" aria-selected="false" class="border-t border-paper-border">
						<button
							type="button"
							onclick={createAndAdd}
							class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-muted hover:bg-paper-ui"
						>
							<span class="text-ink-faint">+</span>
							Create and add <strong class="text-ink-muted">«{inputValue.trim()}»</strong>
						</button>
					</li>
				{/if}
			</ul>
		{/if}
	</div>
</div>
