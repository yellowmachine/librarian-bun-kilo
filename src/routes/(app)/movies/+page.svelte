<script lang="ts">
	import { goto } from '$app/navigation';
	import { MagnifyingGlass, Plus } from 'phosphor-svelte';
	import BookGrid from '$lib/components/BookGrid.svelte';
	import TmdbAttribution from '$lib/components/TmdbAttribution.svelte';
	import {
		MEDIA_FORMATS,
		MEDIA_FORMAT_LABELS,
		formatLine,
		type MediaFormat
	} from '$lib/mediaFormat';

	let { data } = $props();
	const { userMovies, userLibraries, libraryId } = $derived(data);

	const heading = $derived(
		libraryId ? (userLibraries.find((lib) => lib.id === libraryId)?.name ?? 'Movies') : 'Movies'
	);

	let search = $state('');
	let activeFormat = $state<MediaFormat | null>(null);

	function normalize(s: string) {
		return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
	}

	// Solo se ofrecen como filtro los formatos que el usuario tiene.
	const formatsInUse = $derived(
		MEDIA_FORMATS.filter((f) => userMovies.some((m) => m.format === f))
	);

	const filtered = $derived.by(() => {
		let list = userMovies;
		if (activeFormat) list = list.filter((m) => m.format === activeFormat);
		if (search.trim()) {
			const q = normalize(search);
			list = list.filter(
				(m) =>
					normalize(m.title).includes(q) ||
					(m.originalTitle && normalize(m.originalTitle).includes(q)) ||
					m.directors.some((d) => normalize(d).includes(q))
			);
		}
		return list;
	});
</script>

<div class="space-y-6">
	<div class="flex items-end justify-between gap-4">
		<h1 class="font-serif text-2xl font-normal text-ink sm:text-3xl">{heading}</h1>
		<div class="flex shrink-0 items-center gap-2">
			{#if userLibraries.length > 1}
				<select
					aria-label="Library"
					value={libraryId ?? ''}
					onchange={(e) => {
						const id = e.currentTarget.value;
						goto(id ? `/movies?libraryId=${id}` : '/movies');
					}}
					class="border border-paper-border bg-paper px-3 py-2 text-sm text-ink-muted focus:border-ink focus:ring-0"
				>
					<option value="">All libraries</option>
					{#each userLibraries as lib (lib.id)}
						<option value={lib.id}>{lib.name}</option>
					{/each}
				</select>
			{/if}
			<a
				href={libraryId ? `/movies/add?libraryId=${libraryId}` : '/movies/add'}
				class="flex items-center gap-1.5 border border-ink bg-ink px-3 py-2 text-sm text-paper transition-colors hover:bg-ink/90"
			>
				<Plus size={15} weight="bold" />
				<span class="hidden sm:inline">Add</span>
			</a>
		</div>
	</div>

	{#if userMovies.length > 0}
		<div class="space-y-3">
			{#if formatsInUse.length > 1}
				<div class="flex flex-wrap gap-1.5">
					<button
						onclick={() => (activeFormat = null)}
						class="rounded-full border px-2.5 py-0.5 text-xs transition-colors
						{activeFormat === null
							? 'border-ink bg-ink text-paper'
							: 'border-paper-border text-ink-muted hover:border-ink-faint'}"
					>
						All
					</button>
					{#each formatsInUse as f (f)}
						<button
							onclick={() => (activeFormat = activeFormat === f ? null : f)}
							class="rounded-full border px-2.5 py-0.5 text-xs transition-colors
							{activeFormat === f
								? 'border-ink bg-ink text-paper'
								: 'border-paper-border text-ink-muted hover:border-ink-faint'}"
						>
							{MEDIA_FORMAT_LABELS[f]}
						</button>
					{/each}
				</div>
			{/if}

			<div class="relative">
				<MagnifyingGlass
					size={16}
					class="absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
				/>
				<input
					type="search"
					bind:value={search}
					placeholder="Search by title or director..."
					class="w-full border border-paper-border bg-paper-ui py-2 pr-4 pl-9 text-sm text-ink placeholder-ink-faint focus:border-ink focus:bg-paper focus:ring-0"
				/>
			</div>
		</div>

		{#if filtered.length === 0}
			<p class="py-12 text-center text-sm text-ink-faint">No results.</p>
		{:else}
			<BookGrid
				books={filtered.map((m) => ({
					id: m.userMovieId,
					title: m.title,
					authors: m.directors,
					coverUrl: m.coverUrl,
					publishYear: m.releaseYear,
					isAvailable: m.isAvailable,
					copyLabel: formatLine(m.format, m.edition),
					href: `/movies/${m.userMovieId}`
				}))}
			/>
		{/if}
	{:else}
		<div class="flex flex-col items-center justify-center py-24 text-center">
			<div class="mb-6 font-serif text-6xl text-ink-faint">·</div>
			<p class="text-sm text-ink-faint">
				{libraryId ? 'No movies in this library yet.' : 'Your video library is empty.'}
			</p>
			<a href="/movies/add" class="mt-4 text-sm text-ink underline underline-offset-2">
				Add your first movie
			</a>
		</div>
	{/if}

	<TmdbAttribution />
</div>
