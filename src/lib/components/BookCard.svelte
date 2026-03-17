<script lang="ts">
	import { BookOpen } from 'phosphor-svelte';

	interface Props {
		title: string;
		authors?: string[];
		coverUrl?: string | null;
		publishYear?: number | null;
		/** Muestra la banda "Prestado" sobre la portada */
		isAvailable?: boolean;
		/** Modo de presentación:
		 *  - 'grid'   → portada vertical con título y autor debajo (biblioteca, grid)
		 *  - 'list'   → fila horizontal con portada pequeña (resultados de búsqueda)
		 *  - 'detail' → portada grande con metadatos al lado (página de detalle)
		 */
		variant?: 'grid' | 'list' | 'detail';
		/** Work ID de OpenLibrary (ej: "OL45804W"). Si se pasa, se muestra un enlace en variant=detail */
		openLibraryId?: string | null;
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
		variant = 'grid',
		openLibraryId = null,
		href,
		onclick
	}: Props = $props();

	const openLibraryUrl = $derived(
		openLibraryId?.startsWith('OL') ? `https://openlibrary.org/works/${openLibraryId}` : null
	);
</script>

{#snippet cover(classes: string)}
	<div class="relative flex-shrink-0 overflow-hidden bg-neutral-100 {classes}">
		{#if coverUrl}
			<img src={coverUrl} alt={title} class="h-full w-full object-cover" />
		{:else if variant === 'detail'}
			<div class="flex h-full items-center justify-center">
				<BookOpen size={32} weight="thin" class="text-neutral-300" />
			</div>
		{:else}
			<div class="flex h-full items-center justify-center p-2">
				<span class="text-center font-serif text-xs leading-snug text-neutral-400">{title}</span>
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

{#if variant === 'grid'}
	<!-- ── Grid: portada vertical + título/autor debajo ─────────────────── -->
	{#if href}
		<a {href} class="group w-full min-w-0 space-y-2">
			{@render cover('w-full aspect-[2/3] transition-opacity duration-200 group-hover:opacity-80')}
			<div class="space-y-0.5">
				<p class="line-clamp-2 text-xs leading-snug font-medium text-neutral-900">{title}</p>
				{#if authors.length > 0}
					<p class="truncate text-xs text-neutral-400">{authors[0]}</p>
				{/if}
			</div>
		</a>
	{:else}
		<button type="button" {onclick} class="group w-full min-w-0 space-y-2 text-left">
			{@render cover('w-full aspect-[2/3] transition-opacity duration-200 group-hover:opacity-80')}
			<div class="space-y-0.5">
				<p class="line-clamp-2 text-xs leading-snug font-medium text-neutral-900">{title}</p>
				{#if authors.length > 0}
					<p class="truncate text-xs text-neutral-400">{authors[0]}</p>
				{/if}
			</div>
		</button>
	{/if}
{:else if variant === 'list'}
	<!-- ── List: fila horizontal (resultados búsqueda) ───────────────────── -->
	{#if href}
		<a {href} class="flex w-full items-center gap-4 py-4 hover:bg-neutral-50">
			{@render cover('h-16 w-11')}
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-medium text-neutral-900">{title}</p>
				{#if authors.length > 0}
					<p class="truncate text-xs text-neutral-400">{authors.join(', ')}</p>
				{/if}
				{#if publishYear}
					<p class="text-xs text-neutral-300">{publishYear}</p>
				{/if}
			</div>
		</a>
	{:else}
		<button
			type="button"
			{onclick}
			class="flex w-full items-center gap-4 py-4 text-left hover:bg-neutral-50"
		>
			{@render cover('h-16 w-11')}
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-medium text-neutral-900">{title}</p>
				{#if authors.length > 0}
					<p class="truncate text-xs text-neutral-400">{authors.join(', ')}</p>
				{/if}
				{#if publishYear}
					<p class="text-xs text-neutral-300">{publishYear}</p>
				{/if}
			</div>
		</button>
	{/if}
{:else if variant === 'detail'}
	<!-- ── Detail: portada grande + metadatos al lado ────────────────────── -->
	<div class="flex gap-6">
		{@render cover('h-40 w-28 shadow-sm')}
		<div class="min-w-0 space-y-2 pt-1">
			<h1 class="font-serif text-2xl leading-tight font-normal text-neutral-900">{title}</h1>
			{#if authors.length > 0}
				<p class="text-sm text-neutral-500">{authors.join(', ')}</p>
			{/if}
			{#if publishYear}
				<p class="text-xs text-neutral-400">{publishYear}</p>
			{/if}
			{#if openLibraryUrl}
				<a
					href={openLibraryUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-1 text-xs text-neutral-400 underline underline-offset-2 transition-colors hover:text-neutral-700"
				>
					Ver en Open Library ↗
				</a>
			{/if}
		</div>
	</div>
{/if}
