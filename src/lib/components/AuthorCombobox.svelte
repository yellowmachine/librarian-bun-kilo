<script lang="ts">
	import type { AuthorSearchResult } from '$lib/types';

	// Campo de autor con sugerencias de OpenLibrary. Sigue siendo texto libre:
	// las sugerencias solo ayudan a escribir el nombre tal y como aparece en OL
	// (lo que mejora la detección de duplicados), no obligan a elegir una.

	const MIN_CHARS = 3;
	const DEBOUNCE_MS = 300;

	let {
		value = $bindable(''),
		placeholder = 'Author name',
		class: className = ''
	}: {
		value: string;
		placeholder?: string;
		class?: string;
	} = $props();

	const listboxId = `author-listbox-${Math.random().toString(36).slice(2, 10)}`;

	let results = $state<AuthorSearchResult[]>([]);
	let loading = $state(false);
	let open = $state(false);
	let activeIndex = $state(-1);
	let containerEl = $state<HTMLDivElement | null>(null);

	// Evita relanzar la búsqueda cuando el valor cambia por haber elegido una sugerencia
	let lastPicked: string | null = null;
	// Solo se busca tras escribir el usuario, no al montar el campo con un valor ya relleno
	let userTyped = $state(false);

	$effect(() => {
		const q = value.trim();

		if (!userTyped || q.length < MIN_CHARS || q === lastPicked) {
			results = [];
			loading = false;
			return;
		}

		const controller = new AbortController();
		loading = true;
		const timer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/authors/search?q=${encodeURIComponent(q)}`, {
					signal: controller.signal
				});
				results = res.ok ? await res.json() : [];
				activeIndex = -1;
			} catch (e) {
				if (e instanceof DOMException && e.name === 'AbortError') return;
				results = [];
			} finally {
				if (!controller.signal.aborted) loading = false;
			}
		}, DEBOUNCE_MS);

		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	let showList = $derived(open && results.length > 0);

	function pick(author: AuthorSearchResult) {
		lastPicked = author.name;
		value = author.name;
		results = [];
		open = false;
		activeIndex = -1;
	}

	function lifespan(a: AuthorSearchResult): string | null {
		const birth = a.birthDate?.match(/\d{3,4}/)?.[0];
		const death = a.deathDate?.match(/\d{3,4}/)?.[0];
		if (!birth && !death) return null;
		return death ? `${birth ?? '?'}–${death}` : `${birth}`;
	}

	function handleInput() {
		userTyped = true;
		lastPicked = null;
		open = true;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!showList) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			activeIndex = (activeIndex + 1) % results.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			activeIndex = activeIndex <= 0 ? results.length - 1 : activeIndex - 1;
		} else if (e.key === 'Enter' && activeIndex >= 0) {
			// Solo intercepta Enter si hay una sugerencia activa; si no, deja
			// que el formulario se envíe con normalidad.
			e.preventDefault();
			pick(results[activeIndex]);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			open = false;
		}
	}

	function handleFocusOut(e: FocusEvent) {
		if (containerEl && !containerEl.contains(e.relatedTarget as Node)) {
			open = false;
		}
	}
</script>

<div bind:this={containerEl} class="relative min-w-0 {className}" onfocusout={handleFocusOut}>
	<input
		type="text"
		bind:value
		{placeholder}
		autocomplete="off"
		role="combobox"
		aria-autocomplete="list"
		aria-expanded={showList}
		aria-controls={listboxId}
		aria-activedescendant={showList && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
		aria-busy={loading}
		oninput={handleInput}
		onfocus={() => (open = true)}
		onkeydown={handleKeydown}
		class="w-full border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
	/>

	{#if loading}
		<span
			class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-ink-faint"
			aria-hidden="true">…</span
		>
	{/if}

	{#if showList}
		<ul
			id={listboxId}
			role="listbox"
			class="absolute top-full right-0 left-0 z-20 mt-0.5 max-h-72 overflow-y-auto border border-paper-border bg-paper shadow-sm"
		>
			{#each results as author, i (author.id)}
				{@const years = lifespan(author)}
				<li
					id="{listboxId}-{i}"
					role="option"
					aria-selected={i === activeIndex}
					class="cursor-pointer px-3 py-2 text-sm {i === activeIndex
						? 'bg-paper-ui'
						: 'hover:bg-paper-ui'}"
					onmousedown={(e) => {
						// mousedown + preventDefault para no perder el foco antes del click
						e.preventDefault();
						pick(author);
					}}
				>
					<span class="block text-ink">{author.name}</span>
					{#if years || author.topWork}
						<span class="block truncate text-xs text-ink-faint">
							{[years, author.topWork].filter(Boolean).join(' · ')}
						</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
