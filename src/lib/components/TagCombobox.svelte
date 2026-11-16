<script lang="ts">
	import { enhance } from '$app/forms';
	import { trackDropdownPlacement, type DropdownPlacement } from '$lib/dropdownPlacement';

	interface Tag {
		id: string;
		name: string;
		color: string | null;
	}

	let {
		availableTags,
		assignedTags = [],
		onTagAdded
	}: {
		availableTags: Tag[];
		// Las ya puestas: no se ofrece crear otra con el mismo nombre.
		assignedTags?: { name: string }[];
		onTagAdded?: () => void;
	} = $props();

	const DEFAULT_COLOR = '#0a0a0a';

	let inputValue = $state('');
	let open = $state(false);
	let createForm = $state<HTMLFormElement | null>(null);
	// Evita crear dos veces la misma etiqueta con un doble clic o Enter repetido.
	let creating = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);
	let containerEl = $state<HTMLDivElement | null>(null);

	let placement = $state<DropdownPlacement>({ direction: 'down', maxHeight: 256 });

	// Ajusta la lista al espacio visible (barra inferior y teclado en mobile)
	$effect(() => {
		if (!open || !inputEl) return;
		return trackDropdownPlacement(inputEl, (p) => (placement = p));
	});

	// Etiquetas que coinciden con lo escrito (sin distinguir mayúsculas)
	let filtered = $derived(
		inputValue.trim().length === 0
			? availableTags
			: availableTags.filter((t) => t.name.toLowerCase().includes(inputValue.trim().toLowerCase()))
	);

	// Coincidencia exacta (para saber si la etiqueta ya existe)
	let exactMatch = $derived(
		[...availableTags, ...assignedTags].find(
			(t) => t.name.toLowerCase() === inputValue.trim().toLowerCase()
		)
	);

	// Mostrar opción "Crear y añadir" cuando hay texto y no hay coincidencia exacta
	let showCreate = $derived(inputValue.trim().length > 0 && !exactMatch);

	function openDropdown() {
		open = true;
	}

	function closeDropdown() {
		open = false;
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

	// Crear y añadir en un solo paso, con el color por defecto (se cambia en /tags).
	function createAndAdd() {
		if (!showCreate || creating) return;
		createForm?.requestSubmit();
	}

	// Enter con un nombre nuevo lo crea y añade.
	function handleInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && showCreate) {
			e.preventDefault();
			createAndAdd();
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={containerEl} class="relative" onfocusout={handleBlur} onkeydown={handleKeydown}>
	<!-- Formulario de creación: lo envían la opción «Create and add» y Enter -->
	<form
		bind:this={createForm}
		method="POST"
		action="?/createTag"
		class="hidden"
		use:enhance={() => {
			creating = true;
			return async ({ update }) => {
				await update();
				creating = false;
				inputValue = '';
				open = false;
				onTagAdded?.();
			};
		}}
	>
		<input type="hidden" name="name" value={inputValue.trim()} />
		<input type="hidden" name="color" value={DEFAULT_COLOR} />
	</form>

	<!-- Input de búsqueda / creación -->
	<input
		bind:this={inputEl}
		bind:value={inputValue}
		type="text"
		placeholder="Search or create tag..."
		autocomplete="off"
		onfocus={openDropdown}
		oninput={openDropdown}
		onkeydown={handleInputKeydown}
		class="w-full border border-paper-border px-3 py-1.5 text-sm focus:border-brown-600 focus:ring-0"
	/>

	<!-- Dropdown -->
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
					</form>
				</li>
			{/each}

			{#if showCreate}
				<li role="option" aria-selected="false" class="border-t border-paper-border">
					<button
						type="button"
						onclick={createAndAdd}
						disabled={creating}
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
