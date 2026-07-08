<script lang="ts">
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

	let inputValue = $state('');
	let open = $state(false);
	let creatingNew = $state(false);
	let pendingName = $state('');
	let newTagColor = $state('#0a0a0a');
	let inputEl = $state<HTMLInputElement | null>(null);
	let containerEl = $state<HTMLDivElement | null>(null);

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

	function startCreate() {
		pendingName = inputValue.trim();
		creatingNew = true;
		open = false;
	}

	function confirmCreate() {
		tagsToCreate = [...tagsToCreate, { name: pendingName, color: newTagColor }];
		creatingNew = false;
		pendingName = '';
		newTagColor = '#0a0a0a';
		inputValue = '';
	}

	function cancelCreate() {
		creatingNew = false;
		pendingName = '';
		newTagColor = '#0a0a0a';
		inputValue = '';
	}

	function handleBlur(e: FocusEvent) {
		if (containerEl && !containerEl.contains(e.relatedTarget as Node)) {
			open = false;
			if (!creatingNew) inputValue = '';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
			inputEl?.blur();
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
					{#if newTag.color}
						<span
							class="inline-block h-2 w-2 flex-shrink-0 rounded-full"
							style="background-color: {newTag.color}"
						></span>
					{/if}
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

	{#if creatingNew}
		<!-- Formulario de creación con color picker -->
		<div class="flex items-center gap-2">
			<span
				class="flex-1 truncate border border-paper-border px-3 py-1.5 text-sm text-ink-muted"
				title={pendingName}
			>
				{pendingName}
			</span>
			<input
				type="color"
				bind:value={newTagColor}
				title="Choose a color"
				class="h-8 w-8 cursor-pointer rounded-none border border-paper-border p-0.5"
			/>
			<button
				type="button"
				onclick={confirmCreate}
				class="border border-ink bg-ink px-3 py-1.5 text-xs text-paper hover:bg-ink/90"
			>
				Create
			</button>
			<button
				type="button"
				onclick={cancelCreate}
				class="text-ink-faint hover:text-ink-muted"
				aria-label="Cancel"
			>
				×
			</button>
		</div>
	{:else}
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
				class="w-full border border-paper-border px-3 py-1.5 text-sm focus:border-ink focus:ring-0"
			/>

			{#if open && (filtered.length > 0 || showCreate)}
				<ul
					class="absolute top-full right-0 left-0 z-10 mt-0.5 border border-paper-border bg-paper shadow-sm"
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
								onclick={startCreate}
								class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-muted hover:bg-paper-ui"
							>
								<span class="text-ink-faint">+</span>
								Create <strong class="text-ink-muted">«{inputValue.trim()}»</strong>
							</button>
						</li>
					{/if}
				</ul>
			{/if}
		</div>
	{/if}
</div>
