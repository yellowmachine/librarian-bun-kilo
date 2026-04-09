<script lang="ts">
	import { enhance } from '$app/forms';

	interface Tag {
		id: string;
		name: string;
		color: string | null;
	}

	let {
		availableTags,
		onTagAdded
	}: {
		availableTags: Tag[];
		onTagAdded?: () => void;
	} = $props();

	let inputValue = $state('');
	let open = $state(false);
	let newTagColor = $state('#0a0a0a');
	let inputEl = $state<HTMLInputElement | null>(null);
	let containerEl = $state<HTMLDivElement | null>(null);

	// Etiquetas que coinciden con lo escrito (sin distinguir mayúsculas)
	let filtered = $derived(
		inputValue.trim().length === 0
			? availableTags
			: availableTags.filter((t) => t.name.toLowerCase().includes(inputValue.trim().toLowerCase()))
	);

	// Coincidencia exacta (para saber si la etiqueta ya existe)
	let exactMatch = $derived(
		availableTags.find((t) => t.name.toLowerCase() === inputValue.trim().toLowerCase())
	);

	// Mostrar opción "Crear" cuando hay texto y no hay coincidencia exacta
	let showCreate = $derived(inputValue.trim().length > 0 && !exactMatch);

	// Modo creación: cuando el usuario elige "Crear «nombre»"
	let creatingNew = $state(false);
	let pendingName = $state('');

	function openDropdown() {
		open = true;
	}

	function closeDropdown() {
		open = false;
		creatingNew = false;
	}

	function handleBlur(e: FocusEvent) {
		// Cerrar solo si el foco sale del contenedor completo
		if (containerEl && !containerEl.contains(e.relatedTarget as Node)) {
			closeDropdown();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			closeDropdown();
			inputEl?.blur();
		}
	}

	function startCreate() {
		pendingName = inputValue.trim();
		creatingNew = true;
		open = false;
	}

	function cancelCreate() {
		creatingNew = false;
		pendingName = '';
		newTagColor = '#0a0a0a';
		inputValue = '';
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={containerEl} class="relative" onblur={handleBlur} onkeydown={handleKeydown}>
	{#if creatingNew}
		<!-- Formulario de creación con color picker -->
		<form
			method="POST"
			action="?/createTag"
			use:enhance={() => {
				return async ({ update }) => {
					await update();
					creatingNew = false;
					pendingName = '';
					inputValue = '';
					newTagColor = '#0a0a0a';
					onTagAdded?.();
				};
			}}
			class="flex items-center gap-2"
		>
			<input type="hidden" name="name" value={pendingName} />
			<span
				class="flex-1 truncate border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700"
				title={pendingName}
			>
				{pendingName}
			</span>
			<input
				type="color"
				name="color"
				bind:value={newTagColor}
				title="Elige un color"
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
				onclick={cancelCreate}
				class="text-neutral-300 hover:text-neutral-600"
				aria-label="Cancelar"
			>
				×
			</button>
		</form>
	{:else}
		<!-- Input de búsqueda / creación -->
		<input
			bind:this={inputEl}
			bind:value={inputValue}
			type="text"
			placeholder="Buscar o crear etiqueta..."
			autocomplete="off"
			onfocus={openDropdown}
			oninput={openDropdown}
			class="w-full border border-neutral-200 px-3 py-1.5 text-sm focus:border-neutral-900 focus:ring-0"
		/>

		<!-- Dropdown -->
		{#if open && (filtered.length > 0 || showCreate)}
			<ul
				class="absolute top-full right-0 left-0 z-10 mt-0.5 border border-neutral-200 bg-white shadow-sm"
				role="listbox"
			>
				{#each filtered as tag (tag.id)}
					<li role="option" aria-selected="false">
						<form
							method="POST"
							action="?/addTag"
							use:enhance={() => {
								return async ({ update }) => {
									await update();
									inputValue = '';
									open = false;
									onTagAdded?.();
								};
							}}
						>
							<input type="hidden" name="tagId" value={tag.id} />
							<button
								type="submit"
								class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50"
							>
								{#if tag.color}
									<span
										class="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
										style="background-color: {tag.color}"
									></span>
								{/if}
								{tag.name}
							</button>
						</form>
					</li>
				{/each}

				{#if showCreate}
					<li role="option" aria-selected="false" class="border-t border-neutral-100">
						<button
							type="button"
							onclick={startCreate}
							class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-50"
						>
							<span class="text-neutral-300">+</span>
							Crear <strong class="text-neutral-700">«{inputValue.trim()}»</strong>
						</button>
					</li>
				{/if}
			</ul>
		{/if}
	{/if}
</div>
