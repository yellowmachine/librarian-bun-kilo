<script lang="ts">
	import { Sparkle, X } from 'phosphor-svelte';
	import Spinner from '$lib/components/Spinner.svelte';

	// Selector de portada para libros dados de alta a mano: sugiere portadas
	// (fuentes gratuitas + IA con la clave de OpenRouter del usuario, ver
	// src/lib/server/coverSearch.ts) o deja pegar una URL directamente.

	let {
		value = $bindable(''),
		title,
		authors = [],
		isbn = '',
		publishYear = null
	}: {
		value: string;
		title: string;
		authors?: string[];
		isbn?: string;
		publishYear?: number | null;
	} = $props();

	let candidates = $state<string[]>([]);
	let searching = $state(false);
	let searched = $state(false);
	let usedAi = $state(false);

	async function findCover() {
		searching = true;
		searched = false;
		candidates = [];
		try {
			const res = await fetch('/api/books/find-cover', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: title.trim(),
					authors: authors.map((a) => a.trim()).filter(Boolean),
					isbn: isbn.trim() || undefined,
					publishYear: publishYear ?? undefined
				})
			});
			if (res.ok) {
				const data: { candidates: string[]; usedAi: boolean } = await res.json();
				candidates = data.candidates;
				usedAi = data.usedAi;
			}
		} catch {
			// Best-effort: sin candidatos se muestra el aviso de "no encontrada".
		} finally {
			searching = false;
			searched = true;
		}
	}
</script>

<div>
	<div class="flex gap-3">
		{#if value}
			<div class="relative h-24 w-16 shrink-0 border border-paper-border">
				<img src={value} alt="Cover" class="h-full w-full object-cover" />
				<button
					type="button"
					onclick={() => (value = '')}
					aria-label="Remove cover"
					class="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full border border-paper-border bg-paper text-ink-faint hover:text-ink"
				>
					<X size={10} />
				</button>
			</div>
		{/if}
		<div class="min-w-0 flex-1 space-y-2">
			<button
				type="button"
				onclick={findCover}
				disabled={!title.trim() || searching}
				class="flex items-center gap-1.5 border border-paper-border px-3 py-2 text-sm text-ink-muted hover:border-ink-faint hover:text-ink disabled:opacity-40"
			>
				{#if searching}
					<Spinner size="sm" /> Searching…
				{:else}
					<Sparkle size={14} /> Find cover
				{/if}
			</button>
			<input
				type="url"
				bind:value
				placeholder="…or paste an image URL (https://)"
				class="w-full border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
			/>
		</div>
	</div>

	{#if candidates.length > 0}
		<div class="mt-3 flex gap-2 overflow-x-auto pb-1">
			{#each candidates as url (url)}
				<button
					type="button"
					onclick={() => (value = url)}
					aria-label="Use this cover"
					class="h-24 w-16 shrink-0 border-2 {value === url
						? 'border-ink'
						: 'border-transparent hover:border-paper-border'}"
				>
					<img src={url} alt="" class="h-full w-full object-cover" loading="lazy" />
				</button>
			{/each}
		</div>
	{:else if searched}
		<p class="mt-2 text-xs text-ink-faint">
			No cover found.{#if !usedAi}
				Connect an OpenRouter key in <a href="/account" class="underline">your account</a> to also search
				the web with AI.{/if}
		</p>
	{/if}
</div>
