<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowLeft, Camera, Info, Sparkle } from 'phosphor-svelte';
	import BookCard from '$lib/components/BookCard.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import Espera from '$lib/components/Espera.svelte';
	import TmdbAttribution from '$lib/components/TmdbAttribution.svelte';
	import TagSelectorLocal from '$lib/components/TagSelectorLocal.svelte';
	import MoviePhotoScan, { type ScanSummary } from '$lib/components/MoviePhotoScan.svelte';
	import {
		MEDIA_FORMATS,
		MEDIA_FORMAT_LABELS,
		formatLine,
		type MediaFormat
	} from '$lib/mediaFormat';
	import type { MovieSearchResult } from '$lib/types';

	let { data } = $props();
	const { tmdbEnabled, canScan, hasAiKey, userLibraries, userTags } = $derived(data);

	type Mode = 'search' | 'confirm' | 'manual' | 'photo';
	// Sin TMDB solo queda el alta manual.
	// svelte-ignore state_referenced_locally
	let mode = $state<Mode>(data.tmdbEnabled ? 'search' : 'manual');

	// ── Búsqueda ──────────────────────────────────────────────────────────────
	let query = $state('');
	let searching = $state(false);
	let searched = $state(false);
	let results = $state<MovieSearchResult[]>([]);
	let selected = $state<MovieSearchResult | null>(null);

	// ── Etiquetas (las mismas que los libros) ─────────────────────────────────
	let selectedTagIds = $state<string[]>([]);
	let tagsToCreate = $state<{ name: string; color: string | null }[]>([]);
	let suggestingTags = $state(false);
	let tagsSuggested = $state(false);
	let proposedNewTags = $state<string[]>([]);
	const pendingProposedTags = $derived(
		proposedNewTags.filter(
			(name) => !tagsToCreate.some((t) => t.name.toLowerCase() === name.toLowerCase())
		)
	);

	function resetTags() {
		selectedTagIds = [];
		tagsToCreate = [];
		tagsSuggested = false;
		proposedNewTags = [];
	}

	// Pide etiquetas a la IA. `key` identifica para qué se pidieron: si al
	// llegar la respuesta el usuario ya está con otra película, se descarta.
	let suggestionKey = '';
	async function suggestTags(key: string, body: Record<string, unknown>) {
		if (!hasAiKey) return;
		suggestionKey = key;
		suggestingTags = true;
		try {
			const res = await fetch('/api/movies/suggest-tags', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok || suggestionKey !== key) return;
			const result: { tagIds: string[]; newTags?: string[] } = await res.json();
			if (suggestionKey !== key) return;
			proposedNewTags = result.newTags ?? [];
			// Nunca pisa una elección que el usuario ya haya hecho.
			if (selectedTagIds.length === 0 && tagsToCreate.length === 0 && result.tagIds.length > 0) {
				selectedTagIds = result.tagIds;
				tagsSuggested = true;
			}
		} catch {
			// Best-effort: sin sugerencia, se eligen a mano.
		} finally {
			if (suggestionKey === key) suggestingTags = false;
		}
	}

	// La pedida con el botón (película escrita a mano) bloquea la pantalla con Espera; la que sale
	// sola al elegir una película de la búsqueda no, para no cortar al usuario mientras rellena.
	let suggestingManually = $state(false);
	function suggestManualTags() {
		const title = manualTitle.trim();
		if (!title) return;
		suggestingManually = true;
		void suggestTags(`manual:${title}`, {
			title,
			directors: manualDirectors
				.split(',')
				.map((d) => d.trim())
				.filter(Boolean),
			overview: manualOverview.trim() || null
		}).finally(() => (suggestingManually = false));
	}

	// ── Datos de la copia (comunes a las dos rutas) ───────────────────────────
	let format = $state<MediaFormat>('bluray');
	let edition = $state('');
	let notes = $state('');
	// svelte-ignore state_referenced_locally
	let libraryId = $state(data.initialLibraryId);

	// ── Alta manual ───────────────────────────────────────────────────────────
	let manualTitle = $state('');
	let manualOriginalTitle = $state('');
	let manualDirectors = $state('');
	let manualYear = $state('');
	let manualOverview = $state('');
	let manualCoverUrl = $state('');

	let saving = $state(false);
	let errorMsg = $state('');
	type DuplicateMatch = {
		userMovieId: string;
		title: string;
		format: MediaFormat;
		edition: string | null;
		libraryId: string;
	};
	let duplicate = $state<DuplicateMatch | null>(null);
	const duplicateLibraryName = $derived(
		userLibraries.find((lib) => lib.id === duplicate?.libraryId)?.name ?? 'your library'
	);

	// ── Alta por foto ─────────────────────────────────────────────────────────
	let photoInput = $state<HTMLInputElement>();
	let photoFile = $state<File | null>(null);
	let scanSummary = $state<ScanSummary | null>(null);
	// Para volver al modo de partida al cancelar la foto
	let modeBeforePhoto: Mode = 'search';

	function onPhotoSelected(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		errorMsg = '';
		scanSummary = null;
		modeBeforePhoto = mode === 'photo' ? modeBeforePhoto : mode;
		photoFile = file;
		mode = 'photo';
	}

	function leavePhoto() {
		photoFile = null;
		mode = modeBeforePhoto;
	}

	async function onScanDone(summary: ScanSummary, singleId: string | null) {
		if (singleId && summary.added === 1) {
			await goto(`/movies/${singleId}`);
			return;
		}
		scanSummary = summary;
		leavePhoto();
	}

	async function onSearch(e: SubmitEvent) {
		e.preventDefault();
		const q = query.trim();
		if (q.length < 2) return;
		// "Alien 1979" → busca "Alien" en 1979
		const yearMatch = q.match(/^(.*\S)\s+\(?((?:18|19|20)\d{2})\)?$/);
		const params = new URLSearchParams(
			yearMatch ? { q: yearMatch[1], year: yearMatch[2] } : { q }
		).toString();

		searching = true;
		errorMsg = '';
		try {
			const res = await fetch(`/api/movies/search?${params}`);
			if (!res.ok) throw new Error();
			results = await res.json();
			searched = true;
		} catch {
			errorMsg = 'The search failed. Try again in a moment.';
		} finally {
			searching = false;
		}
	}

	function select(movie: MovieSearchResult) {
		selected = movie;
		duplicate = null;
		errorMsg = '';
		resetTags();
		mode = 'confirm';
		suggestTags(movie.id, { movieId: movie.id });
	}

	function enterManual() {
		if (!manualTitle && query.trim()) manualTitle = query.trim();
		duplicate = null;
		errorMsg = '';
		resetTags();
		suggestionKey = '';
		suggestingTags = false;
		mode = 'manual';
	}

	function back() {
		duplicate = null;
		errorMsg = '';
		suggestionKey = '';
		suggestingTags = false;
		mode = 'search';
	}

	// El duplicado depende del formato: al cambiarlo, el aviso deja de valer.
	$effect(() => {
		void format;
		duplicate = null;
	});

	async function save(allowDuplicate = false) {
		const copy = {
			format,
			edition: edition.trim() || undefined,
			notes: notes.trim() || undefined,
			libraryId: libraryId || undefined,
			allowDuplicate,
			tagsToAdd: selectedTagIds.length > 0 ? selectedTagIds : undefined,
			tagsToCreate: tagsToCreate.length > 0 ? tagsToCreate : undefined
		};

		let body: Record<string, unknown>;
		if (mode === 'confirm' && selected) {
			body = { movieId: selected.id, ...copy };
		} else {
			const year = Number(manualYear);
			body = {
				title: manualTitle.trim(),
				originalTitle: manualOriginalTitle.trim() || undefined,
				directors: manualDirectors
					.split(',')
					.map((d) => d.trim())
					.filter(Boolean),
				releaseYear: manualYear && Number.isInteger(year) ? year : undefined,
				overview: manualOverview.trim() || undefined,
				coverUrl: manualCoverUrl.trim() || undefined,
				...copy
			};
		}

		saving = true;
		errorMsg = '';
		try {
			const res = await fetch('/api/movies', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (res.status === 409) {
				duplicate = (await res.json()).match;
				return;
			}
			if (!res.ok) {
				const err = await res.json().catch(() => null);
				errorMsg = err?.message ?? 'The movie could not be added.';
				return;
			}
			const { userMovieId } = await res.json();
			await goto(`/movies/${userMovieId}`);
		} catch {
			errorMsg = 'The movie could not be added.';
		} finally {
			saving = false;
		}
	}

	function onManualSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (manualTitle.trim()) save(Boolean(duplicate));
	}
</script>

{#snippet copyFields()}
	<div>
		<span class="block text-xs font-medium tracking-widest text-ink-muted uppercase">Format</span>
		<div class="mt-1.5 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Format">
			{#each MEDIA_FORMATS as f (f)}
				<button
					type="button"
					role="radio"
					aria-checked={format === f}
					onclick={() => (format = f)}
					class="border py-2 text-sm transition-colors
					{format === f
						? 'border-ink bg-ink text-paper'
						: 'border-paper-border text-ink-muted hover:border-ink-faint'}"
				>
					{MEDIA_FORMAT_LABELS[f]}
				</button>
			{/each}
		</div>
	</div>

	<div>
		<label for="edition" class="block text-xs font-medium tracking-widest text-ink-muted uppercase">
			Edition <span class="tracking-normal normal-case">(optional)</span>
		</label>
		<input
			id="edition"
			type="text"
			bind:value={edition}
			maxlength="200"
			placeholder="Steelbook, collector's edition, director's cut..."
			class="mt-1.5 w-full border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
		/>
	</div>

	<div>
		<label for="notes" class="block text-xs font-medium tracking-widest text-ink-muted uppercase">
			Notes <span class="tracking-normal normal-case">(optional)</span>
		</label>
		<textarea
			id="notes"
			bind:value={notes}
			rows="2"
			maxlength="1000"
			placeholder="Condition, extras, region..."
			class="mt-1.5 w-full border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
		></textarea>
	</div>

	{#if userLibraries.length > 1}
		<div>
			<label
				for="library"
				class="block text-xs font-medium tracking-widest text-ink-muted uppercase"
			>
				Library
			</label>
			<select
				id="library"
				bind:value={libraryId}
				class="mt-1.5 w-full border border-paper-border bg-paper px-3 py-2 text-sm focus:border-ink focus:ring-0"
			>
				{#each userLibraries as lib (lib.id)}
					<option value={lib.id}>{lib.name}</option>
				{/each}
			</select>
		</div>
	{/if}

	{#if suggestingManually}<Espera>Suggesting tags…</Espera>{/if}
	<div>
		<span
			class="flex items-center gap-2 text-xs font-medium tracking-widest text-ink-muted uppercase"
		>
			Tags <span class="tracking-normal normal-case">(optional)</span>
			{#if suggestingTags}
				<span class="flex items-center gap-1 tracking-normal text-ink-faint normal-case">
					<Spinner size="sm" /> Suggesting…
				</span>
			{:else if tagsSuggested}
				<span class="flex items-center gap-1 tracking-normal text-ink-faint normal-case">
					<Sparkle size={12} /> Suggested by AI
				</span>
			{:else if mode === 'manual' && hasAiKey && manualTitle.trim()}
				<button
					type="button"
					onclick={suggestManualTags}
					class="flex items-center gap-1 tracking-normal text-ink-faint normal-case underline underline-offset-2 hover:text-ink"
				>
					<Sparkle size={12} /> Suggest
				</button>
			{/if}
		</span>
		<div class="mt-1.5">
			<TagSelectorLocal availableTags={userTags} bind:selectedTagIds bind:tagsToCreate />
		</div>
		{#if pendingProposedTags.length > 0}
			<div class="mt-2 flex flex-wrap items-center gap-2">
				<span class="flex items-center gap-1 text-xs text-ink-faint">
					<Sparkle size={12} /> New tag ideas:
				</span>
				{#each pendingProposedTags as name (name)}
					<button
						type="button"
						onclick={() => (tagsToCreate = [...tagsToCreate, { name, color: null }])}
						class="border border-dashed border-ink-faint px-2.5 py-0.5 text-xs text-ink-muted transition-colors hover:border-ink hover:text-ink"
					>
						+ {name}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	{#if duplicate}
		<div class="flex items-start gap-2.5 border border-paper-border bg-paper-ui px-4 py-3">
			<Info size={16} class="mt-0.5 shrink-0 text-ink-faint" />
			<p class="text-sm text-ink-muted">
				You already have this movie on {formatLine(duplicate.format, duplicate.edition)} in
				<strong>{duplicateLibraryName}</strong>.
				<a
					href="/movies/{duplicate.userMovieId}"
					class="underline underline-offset-2 hover:text-ink">View it</a
				>
			</p>
		</div>
	{/if}
{/snippet}

{#snippet photoButton()}
	{#if canScan}
		<button
			type="button"
			onclick={() => photoInput?.click()}
			class="group flex w-full items-center justify-center gap-3 border border-paper-border p-4 text-sm text-ink-muted transition-colors hover:border-ink hover:text-ink"
		>
			<Camera size={22} weight="thin" class="text-ink-faint group-hover:text-ink" />
			Take a photo of the cover (or of several spines)
		</button>
	{:else}
		<p class="text-center text-xs text-ink-faint">
			Connect an OpenRouter key in <a href="/account" class="underline underline-offset-2"
				>your account</a
			> to add movies from a photo.
		</p>
	{/if}
{/snippet}

{#snippet actions(onAdd: () => void)}
	<div class="flex gap-3">
		<button
			type="button"
			onclick={() => (data.tmdbEnabled ? back() : history.back())}
			class="flex-1 border border-paper-border py-2.5 text-sm text-ink-muted hover:border-ink-faint"
		>
			Cancel
		</button>
		<button
			type="submit"
			onclick={onAdd}
			disabled={saving}
			class="flex flex-1 items-center justify-center gap-2 border border-ink bg-ink py-2.5 text-sm text-paper hover:bg-ink/90 disabled:opacity-60"
		>
			{#if saving}<Spinner size="sm" />{/if}
			{duplicate ? 'Add another copy' : 'Add to my movies'}
		</button>
	</div>
{/snippet}

<div class="mx-auto max-w-xl space-y-6">
	<div class="flex items-center gap-3">
		<a
			href="/movies"
			aria-label="Back"
			onclick={(e) => {
				if (mode === 'photo') {
					e.preventDefault();
					leavePhoto();
					return;
				}
				if (mode === 'search' || !tmdbEnabled) return;
				e.preventDefault();
				back();
			}}
			class="text-ink-faint hover:text-ink"><ArrowLeft size={20} /></a
		>
		<h1 class="font-serif text-2xl font-normal text-ink">Add movie</h1>
	</div>

	{#if errorMsg}
		<p class="border border-ink bg-paper-ui px-4 py-2.5 text-sm text-ink">{errorMsg}</p>
	{/if}

	{#if scanSummary}
		<div
			class="flex items-center justify-between border border-paper-border bg-paper-ui px-4 py-2.5 text-sm text-ink-muted"
		>
			<span>
				Added {scanSummary.added}
				{scanSummary.added === 1 ? 'movie' : 'movies'} from the photo.
				{#if scanSummary.duplicates > 0}{scanSummary.duplicates} you already had.{/if}
				{#if scanSummary.failed > 0}{scanSummary.failed} could not be added.{/if}
			</span>
			<a href="/movies" class="ml-4 shrink-0 text-xs text-ink underline underline-offset-2"
				>View movies</a
			>
		</div>
	{/if}

	<input
		bind:this={photoInput}
		type="file"
		accept="image/*"
		capture="environment"
		class="hidden"
		onchange={onPhotoSelected}
	/>

	{#if mode === 'photo' && photoFile}
		{#key photoFile}
			<MoviePhotoScan
				file={photoFile}
				{userLibraries}
				bind:libraryId
				onCancel={leavePhoto}
				onDone={onScanDone}
				onError={(message) => {
					errorMsg = message;
					leavePhoto();
				}}
			/>
		{/key}
	{:else if mode === 'search'}
		<form onsubmit={onSearch} class="flex gap-2">
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="search"
				bind:value={query}
				placeholder="Title, optionally with the year: Alien 1979"
				autofocus
				class="min-w-0 flex-1 border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
			/>
			<button
				type="submit"
				disabled={searching}
				class="border border-ink bg-ink px-4 py-2 text-sm text-paper hover:bg-ink/90"
			>
				Search
			</button>
		</form>

		{#if searching}
			<div class="flex justify-center py-12">
				<Spinner size="md" class="text-ink-faint" />
			</div>
		{:else if searched}
			{#if results.length === 0}
				<p class="py-6 text-center text-sm text-ink-faint">No movies found.</p>
			{:else}
				<ul class="grid grid-cols-1 sm:grid-cols-2 sm:gap-2">
					{#each results as movie (movie.id)}
						<li class="border-b border-paper-border sm:border">
							<BookCard
								title={movie.title}
								authors={movie.originalTitle ? [movie.originalTitle] : []}
								coverUrl={movie.posterUrl}
								publishYear={movie.releaseYear}
								variant="list"
								onclick={() => select(movie)}
							/>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}

		{@render photoButton()}

		<p class="text-center text-sm text-ink-faint">
			Not there? <button
				type="button"
				onclick={enterManual}
				class="text-ink underline underline-offset-2">Enter it manually</button
			>
		</p>
	{:else if mode === 'confirm' && selected}
		<div class="space-y-6">
			<div class="border border-paper-border p-5">
				<BookCard
					title={selected.title}
					authors={selected.originalTitle ? [selected.originalTitle] : []}
					coverUrl={selected.posterUrl}
					publishYear={selected.releaseYear}
					variant="detail"
				/>
			</div>
			{@render copyFields()}
			{@render actions(() => save(Boolean(duplicate)))}
		</div>
	{:else if mode === 'manual'}
		<form onsubmit={onManualSubmit} class="space-y-5">
			{#if !tmdbEnabled}
				<p class="border border-paper-border bg-paper-ui px-4 py-2.5 text-sm text-ink-muted">
					Movie search isn't set up on this server, so movies are entered by hand.
				</p>
				{@render photoButton()}
			{/if}

			<div>
				<label
					for="title"
					class="block text-xs font-medium tracking-widest text-ink-muted uppercase"
				>
					Title <span class="tracking-normal text-ink-faint normal-case">*</span>
				</label>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					id="title"
					type="text"
					bind:value={manualTitle}
					required
					maxlength="500"
					autofocus
					class="mt-1.5 w-full border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
				/>
			</div>

			<div>
				<label
					for="original-title"
					class="block text-xs font-medium tracking-widest text-ink-muted uppercase"
				>
					Original title <span class="tracking-normal normal-case">(optional)</span>
				</label>
				<input
					id="original-title"
					type="text"
					bind:value={manualOriginalTitle}
					maxlength="500"
					class="mt-1.5 w-full border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
				/>
			</div>

			<div class="grid grid-cols-[1fr_6rem] gap-3">
				<div>
					<label
						for="directors"
						class="block text-xs font-medium tracking-widest text-ink-muted uppercase"
					>
						Director <span class="tracking-normal normal-case">(optional)</span>
					</label>
					<input
						id="directors"
						type="text"
						bind:value={manualDirectors}
						placeholder="Separate several with commas"
						class="mt-1.5 w-full border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
					/>
				</div>
				<div>
					<label
						for="year"
						class="block text-xs font-medium tracking-widest text-ink-muted uppercase"
					>
						Year
					</label>
					<input
						id="year"
						type="number"
						inputmode="numeric"
						min="1800"
						max="2999"
						bind:value={manualYear}
						class="mt-1.5 w-full border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
					/>
				</div>
			</div>

			<div>
				<label
					for="overview"
					class="block text-xs font-medium tracking-widest text-ink-muted uppercase"
				>
					Synopsis <span class="tracking-normal normal-case">(optional)</span>
				</label>
				<textarea
					id="overview"
					bind:value={manualOverview}
					rows="3"
					maxlength="5000"
					class="mt-1.5 w-full border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
				></textarea>
			</div>

			<div>
				<label
					for="cover-url"
					class="block text-xs font-medium tracking-widest text-ink-muted uppercase"
				>
					Cover image URL <span class="tracking-normal normal-case">(optional)</span>
				</label>
				<input
					id="cover-url"
					type="url"
					bind:value={manualCoverUrl}
					pattern="https://.*"
					placeholder="https://..."
					class="mt-1.5 w-full border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
				/>
			</div>

			{@render copyFields()}
			{@render actions(() => {})}
		</form>
	{/if}

	{#if tmdbEnabled}
		<TmdbAttribution />
	{/if}
</div>
