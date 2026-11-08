<script lang="ts">
	// Alta de películas por foto: la IA lee las carátulas (o lomos), el servidor
	// propone su ficha de TMDB y aquí el usuario revisa, corrige y confirma.
	// Con una sola película, además puede quedarse su foto como portada.
	import { onMount } from 'svelte';
	import { Check } from 'phosphor-svelte';
	import Spinner from './Spinner.svelte';
	import { cropImage, resizeImageFile } from '$lib/image';
	import { MEDIA_FORMATS, MEDIA_FORMAT_LABELS, type MediaFormat } from '$lib/mediaFormat';
	import type { MovieSearchResult } from '$lib/types';

	type ScannedMovie = {
		title: string;
		originalTitle: string | null;
		releaseYear: number | null;
		director: string | null;
		format: MediaFormat | null;
		edition: string | null;
		confidence: 'high' | 'medium' | 'low';
		box: [number, number, number, number] | null;
		matches: MovieSearchResult[];
	};

	type Item = {
		scanned: ScannedMovie;
		/** id de TMDB elegido, o 'manual' para darla de alta tal como se leyó */
		choice: string;
		selected: boolean;
		format: MediaFormat;
		edition: string;
	};

	export type ScanSummary = { added: number; duplicates: number; failed: number };

	interface Props {
		file: File;
		libraryId: string;
		userLibraries: { id: string; name: string }[];
		onCancel: () => void;
		/** singleId: la película añadida cuando solo había una */
		onDone: (summary: ScanSummary, singleId: string | null) => void;
		onError: (message: string) => void;
	}

	let { file, libraryId = $bindable(), userLibraries, onCancel, onDone, onError }: Props = $props();

	let phase = $state<'analyzing' | 'review' | 'adding'>('analyzing');
	let preview = $state('');
	let items = $state<Item[]>([]);
	let progress = $state(0);

	// Portada con una sola película: el póster de TMDB o la foto recortada
	let croppedPhoto = $state<string | null>(null);
	let coverChoice = $state<'poster' | 'photo'>('poster');

	const single = $derived(items.length === 1 ? items[0] : null);
	const selectedCount = $derived(items.filter((i) => i.selected).length);

	function matchFor(item: Item): MovieSearchResult | null {
		return item.scanned.matches.find((m) => m.id === item.choice) ?? null;
	}

	onMount(async () => {
		try {
			preview = await resizeImageFile(file);
			const res = await fetch('/api/movies/scan', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ image: preview })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				onError(body?.message ?? 'Could not analyze the photo.');
				return;
			}
			const scanned: ScannedMovie[] = (await res.json()).movies ?? [];
			if (scanned.length === 0) {
				onError('No movies were recognized in that photo.');
				return;
			}

			items = scanned.map((s) => ({
				scanned: s,
				choice: s.matches[0]?.id ?? 'manual',
				// Se marcan de entrada las que la IA leyó bien y TMDB reconoce
				selected: s.confidence !== 'low' && s.matches.length > 0,
				format: s.format ?? 'bluray',
				edition: s.edition ?? ''
			}));

			if (scanned.length === 1) {
				const only = scanned[0];
				// La foto solo sirve de portada si se ve la carátula delantera.
				if (only.box) croppedPhoto = await cropImage(preview, only.box).catch(() => null);
				// Si TMDB no tiene póster, la foto es mejor que nada.
				if (croppedPhoto && !only.matches[0]?.posterUrl) coverChoice = 'photo';
				items[0].selected = true;
			}
			phase = 'review';
		} catch {
			onError('Could not analyze the photo. Check your connection.');
		}
	});

	function bodyFor(item: Item, allowDuplicate: boolean): Record<string, unknown> {
		const copy = {
			format: item.format,
			edition: item.edition.trim() || undefined,
			libraryId: libraryId || undefined,
			allowDuplicate
		};
		if (item.choice !== 'manual') return { movieId: item.choice, ...copy };
		const s = item.scanned;
		return {
			title: s.title,
			originalTitle: s.originalTitle ?? undefined,
			directors: s.director ? [s.director] : [],
			releaseYear: s.releaseYear ?? undefined,
			...copy
		};
	}

	async function addSelected() {
		phase = 'adding';
		progress = 0;
		const summary: ScanSummary = { added: 0, duplicates: 0, failed: 0 };
		let singleId: string | null = null;

		for (const item of items.filter((i) => i.selected)) {
			try {
				const res = await fetch('/api/movies', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(bodyFor(item, false))
				});
				if (res.status === 409) summary.duplicates++;
				else if (!res.ok) summary.failed++;
				else {
					summary.added++;
					singleId = (await res.json()).userMovieId;
				}
			} catch {
				summary.failed++;
			}
			progress++;
		}

		// Sin póster de TMDB (p.ej. alta "tal como se leyó"), la foto aunque se
		// hubiera elegido el póster.
		const usePhoto = coverChoice === 'photo' || (single && !matchFor(single)?.posterUrl);
		if (single && singleId && usePhoto && croppedPhoto) {
			// Best-effort: si falla, la película queda con el póster de TMDB.
			await fetch(`/api/movies/${singleId}/cover`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ image: croppedPhoto })
			}).catch(() => null);
		}

		onDone(summary, items.length === 1 ? singleId : null);
	}

	const selectClass =
		'w-full border border-paper-border bg-paper px-2 py-1.5 text-sm focus:border-ink focus:ring-0';
</script>

{#if phase === 'analyzing'}
	<div class="space-y-4">
		{#if preview}
			<img src={preview} alt="" class="max-h-64 w-full object-contain opacity-60" />
		{/if}
		<div class="flex items-center justify-center gap-2 py-4 text-sm text-ink-faint">
			<Spinner size="sm" /> Reading the covers…
		</div>
	</div>
{:else if phase === 'adding'}
	<div class="flex items-center justify-center gap-2 py-12 text-sm text-ink-faint">
		<Spinner size="sm" /> Adding {progress + 1 > selectedCount ? selectedCount : progress + 1} of
		{selectedCount}…
	</div>
{:else}
	<div class="space-y-5">
		<p class="text-sm text-ink-muted">
			{items.length === 1
				? 'Check the movie and its format before adding it.'
				: `Found ${items.length} movies. Tick the ones to add and check each match.`}
		</p>

		<ul class="space-y-3">
			{#each items as item, i (i)}
				{@const match = matchFor(item)}
				<li
					class="flex gap-3 border p-3 transition-colors
					{item.selected ? 'border-ink-faint' : 'border-paper-border opacity-60'}"
				>
					{#if items.length > 1}
						<button
							type="button"
							onclick={() => (item.selected = !item.selected)}
							aria-label={item.selected ? 'Skip' : 'Add'}
							aria-pressed={item.selected}
							class="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors
							{item.selected ? 'border-ink bg-ink text-paper' : 'border-paper-border text-transparent'}"
						>
							<Check size={12} weight="bold" />
						</button>
					{/if}

					<div class="h-24 w-16 shrink-0 overflow-hidden bg-paper-ui">
						{#if match?.posterUrl}
							<img src={match.posterUrl} alt="" class="h-full w-full object-cover" />
						{/if}
					</div>

					<div class="min-w-0 flex-1 space-y-2">
						<p class="text-xs text-ink-faint">
							Read: <span class="text-ink-muted">{item.scanned.title}</span
							>{#if item.scanned.releaseYear}
								({item.scanned.releaseYear}){/if}
							{#if item.scanned.confidence === 'low'}· <em>unsure</em>{/if}
						</p>
						<select bind:value={item.choice} aria-label="Movie" class={selectClass}>
							{#each item.scanned.matches as m (m.id)}
								<option value={m.id}>
									{m.title}{m.releaseYear ? ` (${m.releaseYear})` : ''}{m.originalTitle
										? ` — ${m.originalTitle}`
										: ''}
								</option>
							{/each}
							<option value="manual">Not on TMDB — add as read</option>
						</select>
						<div class="grid grid-cols-2 gap-2">
							<select bind:value={item.format} aria-label="Format" class={selectClass}>
								{#each MEDIA_FORMATS as f (f)}
									<option value={f}>{MEDIA_FORMAT_LABELS[f]}</option>
								{/each}
							</select>
							<input
								type="text"
								bind:value={item.edition}
								maxlength="200"
								placeholder="Edition"
								aria-label="Edition"
								class="{selectClass} min-w-0"
							/>
						</div>
					</div>
				</li>
			{/each}
		</ul>

		{#if userLibraries.length > 1}
			<div>
				<label
					for="scan-library"
					class="block text-xs font-medium tracking-widest text-ink-muted uppercase">Library</label
				>
				<select id="scan-library" bind:value={libraryId} class="mt-1.5 {selectClass}">
					{#each userLibraries as lib (lib.id)}
						<option value={lib.id}>{lib.name}</option>
					{/each}
				</select>
			</div>
		{/if}

		{#if single && croppedPhoto}
			<div class="space-y-2">
				<span class="block text-xs font-medium tracking-widest text-ink-muted uppercase">Cover</span
				>
				<div class="grid grid-cols-2 gap-3">
					{#each [{ key: 'poster', label: 'TMDB poster', src: matchFor(single)?.posterUrl ?? null }, { key: 'photo', label: 'My photo', src: croppedPhoto }] as option (option.key)}
						<button
							type="button"
							disabled={!option.src}
							onclick={() => (coverChoice = option.key as 'poster' | 'photo')}
							aria-pressed={coverChoice === option.key}
							class="space-y-1.5 border p-2 text-xs transition-colors disabled:opacity-40
							{coverChoice === option.key
								? 'border-ink text-ink'
								: 'border-paper-border text-ink-muted hover:border-ink-faint'}"
						>
							<div class="aspect-[2/3] w-full overflow-hidden bg-paper-ui">
								{#if option.src}
									<img src={option.src} alt={option.label} class="h-full w-full object-cover" />
								{/if}
							</div>
							{option.label}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<div class="flex gap-3">
			<button
				type="button"
				onclick={onCancel}
				class="flex-1 border border-paper-border py-2.5 text-sm text-ink-muted hover:border-ink-faint"
			>
				Cancel
			</button>
			<button
				type="button"
				onclick={addSelected}
				disabled={selectedCount === 0}
				class="flex-1 border border-ink bg-ink py-2.5 text-sm text-paper hover:bg-ink/90 disabled:opacity-40"
			>
				{selectedCount === 1 ? 'Add movie' : `Add ${selectedCount} movies`}
			</button>
		</div>
	</div>
{/if}
