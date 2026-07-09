<script lang="ts">
	import { BookOpen, X } from 'phosphor-svelte';

	interface Props {
		title: string;
		authors?: string[];
		coverUrl?: string | null;
		publishYear?: number | null;
		/** Muestra la banda "Prestado" sobre la portada */
		isAvailable?: boolean;
		/** "Copy 2 of 3" — solo variant 'grid', cuando hay más de una copia del mismo libro */
		copyLabel?: string;
		/** Modo de presentación:
		 *  - 'grid'   → portada vertical con título y autor debajo (biblioteca, grid)
		 *  - 'list'   → fila horizontal con portada pequeña (resultados de búsqueda)
		 *  - 'detail' → portada grande con metadatos al lado (página de detalle)
		 */
		variant?: 'grid' | 'list' | 'detail';
		/** Si se pasa, envuelve la card en un <a> */
		href?: string;
		onclick?: () => void;
	}

	let {
		title,
		authors = [],
		coverUrl = null,
		publishYear = null,
		isAvailable = true,
		copyLabel,
		variant = 'grid',
		href,
		onclick
	}: Props = $props();

	let coverModalOpen = $state(false);

	function openCoverModal() {
		if (coverUrl) coverModalOpen = true;
	}

	function closeCoverModal() {
		coverModalOpen = false;
	}

	// OpenLibrary covers are stored as "-M" (180x280). "-L" (320x500) is the
	// largest fixed size the covers API offers, so request it for the lightbox.
	const modalCoverUrl = $derived(coverUrl?.replace(/-M\.jpg$/, '-L.jpg') ?? coverUrl);
</script>

{#snippet cover(classes: string)}
	<div class="relative flex-shrink-0 overflow-hidden bg-paper-ui {classes}">
		{#if coverUrl}
			<img src={coverUrl} alt={title} class="h-full w-full object-cover" />
		{:else if variant === 'detail'}
			<div class="flex h-full items-center justify-center">
				<BookOpen size={32} weight="thin" class="text-ink-faint" />
			</div>
		{:else}
			<div class="flex h-full items-center justify-center p-2">
				<span class="text-center font-serif text-xs leading-snug text-ink-faint">{title}</span>
			</div>
		{/if}
		{#if !isAvailable}
			<div
				class="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-2"
			>
				<span class="text-xs font-medium text-white">Prestado</span>
			</div>
		{/if}
	</div>
{/snippet}

<svelte:window
	onkeydown={(e) => {
		if (coverModalOpen && e.key === 'Escape') closeCoverModal();
	}}
/>

{#if variant === 'grid'}
	<!-- ── Grid: portada vertical + título/autor debajo ─────────────────── -->
	{#if href}
		<a {href} class="group w-full min-w-0 space-y-2">
			{@render cover('w-full aspect-[2/3] transition-opacity duration-200 group-hover:opacity-80')}
			<div class="space-y-0.5">
				<p class="text-xs leading-snug font-medium text-ink">{title}</p>
				{#if authors.length > 0}
					<p class="truncate text-xs text-ink-faint">{authors[0]}</p>
				{/if}
				{#if copyLabel}
					<p class="text-[10px] text-ink-faint">{copyLabel}</p>
				{/if}
			</div>
		</a>
	{:else}
		<button type="button" {onclick} class="group w-full min-w-0 space-y-2 text-left">
			{@render cover('w-full aspect-[2/3] transition-opacity duration-200 group-hover:opacity-80')}
			<div class="space-y-0.5">
				<p class="text-xs leading-snug font-medium text-ink">{title}</p>
				{#if authors.length > 0}
					<p class="truncate text-xs text-ink-faint">{authors[0]}</p>
				{/if}
				{#if copyLabel}
					<p class="text-[10px] text-ink-faint">{copyLabel}</p>
				{/if}
			</div>
		</button>
	{/if}
{:else if variant === 'list'}
	<!-- ── List: fila horizontal (resultados búsqueda) ───────────────────── -->
	{#if href}
		<a {href} class="flex w-full items-center gap-4 py-4 hover:bg-paper-ui">
			{@render cover('h-16 w-11')}
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-medium text-ink">{title}</p>
				{#if authors.length > 0}
					<p class="truncate text-xs text-ink-faint">{authors.join(', ')}</p>
				{/if}
				{#if publishYear}
					<p class="text-xs text-ink-faint">{publishYear}</p>
				{/if}
			</div>
		</a>
	{:else}
		<button
			type="button"
			{onclick}
			class="flex w-full items-center gap-4 py-4 text-left hover:bg-paper-ui"
		>
			{@render cover('h-16 w-11')}
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-medium text-ink">{title}</p>
				{#if authors.length > 0}
					<p class="truncate text-xs text-ink-faint">{authors.join(', ')}</p>
				{/if}
				{#if publishYear}
					<p class="text-xs text-ink-faint">{publishYear}</p>
				{/if}
			</div>
		</button>
	{/if}
{:else if variant === 'detail'}
	<!-- ── Detail: portada grande + metadatos al lado ────────────────────── -->
	<div class="flex gap-6">
		{#if coverUrl}
			<button
				type="button"
				onclick={openCoverModal}
				class="flex-shrink-0 cursor-zoom-in transition-opacity duration-200 hover:opacity-80"
				aria-label="View cover in full size"
			>
				{@render cover('h-40 w-28 shadow-sm')}
			</button>
		{:else}
			{@render cover('h-40 w-28 shadow-sm')}
		{/if}
		<div class="min-w-0 space-y-2 pt-1">
			<h1 class="font-serif text-2xl leading-tight font-normal text-ink">{title}</h1>
			{#if authors.length > 0}
				<p class="text-sm text-ink-muted">{authors.join(', ')}</p>
			{/if}
			{#if publishYear}
				<p class="text-xs text-ink-faint">{publishYear}</p>
			{/if}
		</div>
	</div>

	{#if coverModalOpen && coverUrl}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
			role="dialog"
			aria-modal="true"
			aria-label="Book cover"
			tabindex="-1"
			onclick={(e) => {
				if (e.target === e.currentTarget) closeCoverModal();
			}}
		>
			<button
				type="button"
				onclick={closeCoverModal}
				aria-label="Close"
				class="absolute top-4 right-4 text-white/80 transition-colors hover:text-white"
			>
				<X size={36} weight="light" />
			</button>
			<img
				src={modalCoverUrl}
				alt={title}
				class="h-auto max-h-[85vh] w-[min(28rem,90vw)] object-contain shadow-lg"
			/>
		</div>
	{/if}
{/if}
