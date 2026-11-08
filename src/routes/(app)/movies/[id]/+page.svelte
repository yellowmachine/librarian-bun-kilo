<script lang="ts">
	import { enhance } from '$app/forms';
	import { Trash } from 'phosphor-svelte';
	import BookCard from '$lib/components/BookCard.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import TmdbAttribution from '$lib/components/TmdbAttribution.svelte';
	import { MEDIA_FORMATS, MEDIA_FORMAT_LABELS, formatLine } from '$lib/mediaFormat';

	let { data, form } = $props();
	const { movie, userLibraries } = $derived(data);

	let confirmingRemove = $state(false);
	let removeForm = $state<HTMLFormElement>();
	let editingCover = $state(false);

	const facts = $derived(
		[
			movie.runtime ? `${movie.runtime} min` : null,
			movie.genres.length > 0 ? movie.genres.join(', ') : null
		].filter(Boolean)
	);

	const labelClass = 'block text-xs font-medium tracking-widest text-ink-muted uppercase';
	const inputClass =
		'mt-1.5 w-full border border-paper-border bg-paper px-3 py-2 text-sm focus:border-ink focus:ring-0';
</script>

<div class="mx-auto max-w-xl space-y-8">
	<div class="space-y-3">
		<BookCard
			title={movie.title}
			authors={movie.directors}
			coverUrl={movie.coverUrl}
			publishYear={movie.releaseYear}
			isAvailable={movie.isAvailable}
			variant="detail"
		/>
		{#if movie.originalTitle}
			<p class="text-xs text-ink-faint">Original title: {movie.originalTitle}</p>
		{/if}
		<p class="text-sm text-ink-muted">
			{formatLine(movie.format, movie.edition)}{#if facts.length > 0}<span class="text-ink-faint">
					· {facts.join(' · ')}</span
				>{/if}
		</p>
	</div>

	{#if movie.overview}
		<div class="space-y-2">
			<span class={labelClass}>Synopsis</span>
			<p class="text-sm leading-relaxed text-ink-muted">{movie.overview}</p>
		</div>
	{/if}

	{#if form?.error}
		<p class="border border-ink bg-paper-ui px-4 py-2.5 text-sm text-ink">{form.error}</p>
	{/if}

	<!-- ── Copia: formato, edición, notas, disponibilidad ───────────────── -->
	<form
		method="POST"
		action="?/update"
		use:enhance={() =>
			async ({ update }) =>
				update({ reset: false })}
		class="space-y-5"
	>
		<div>
			<label for="format" class={labelClass}>Format</label>
			<select id="format" name="format" value={movie.format} class={inputClass}>
				{#each MEDIA_FORMATS as f (f)}
					<option value={f}>{MEDIA_FORMAT_LABELS[f]}</option>
				{/each}
			</select>
		</div>
		<div>
			<label for="edition" class={labelClass}>Edition</label>
			<input
				id="edition"
				name="edition"
				type="text"
				maxlength="200"
				value={movie.edition ?? ''}
				placeholder="Steelbook, collector's edition..."
				class={inputClass}
			/>
		</div>
		<div>
			<label for="notes" class={labelClass}>Notes</label>
			<textarea id="notes" name="notes" rows="2" maxlength="1000" class={inputClass}
				>{movie.notes ?? ''}</textarea
			>
		</div>
		<label class="flex items-center gap-2 text-sm text-ink-muted">
			<input
				type="checkbox"
				name="isAvailable"
				value="true"
				checked={movie.isAvailable}
				class="border-paper-border text-ink focus:ring-0"
			/>
			Available (not lent out)
		</label>
		<div class="flex items-center gap-3">
			<button
				type="submit"
				class="border border-ink bg-ink px-4 py-2 text-sm text-paper hover:bg-ink/90"
			>
				Save
			</button>
			{#if form?.success}<span class="text-xs text-ink-faint">Saved.</span>{/if}
		</div>
	</form>

	<!-- ── Biblioteca ───────────────────────────────────────────────────── -->
	{#if userLibraries.length > 1}
		<form method="POST" action="?/moveLibrary" use:enhance class="flex items-end gap-2">
			<div class="flex-1">
				<label for="library" class={labelClass}>Library</label>
				<select id="library" name="libraryId" value={movie.libraryId} class={inputClass}>
					{#each userLibraries as lib (lib.id)}
						<option value={lib.id}>{lib.name}</option>
					{/each}
				</select>
			</div>
			<button
				type="submit"
				class="border border-paper-border px-4 py-2 text-sm text-ink-muted hover:border-ink-faint hover:text-ink"
			>
				Move
			</button>
		</form>
	{/if}

	<!-- ── Portada ──────────────────────────────────────────────────────── -->
	<div class="space-y-2">
		<span class={labelClass}>Cover</span>
		{#if editingCover}
			<form
				method="POST"
				action="?/setCover"
				use:enhance={() =>
					async ({ result, update }) => {
						await update();
						if (result.type === 'success') editingCover = false;
					}}
				class="flex gap-2"
			>
				<input
					name="coverUrl"
					type="url"
					required
					pattern="https://.*"
					placeholder="https://... (e.g. a photo of this edition)"
					class="min-w-0 flex-1 border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
				/>
				<button
					type="submit"
					class="border border-ink bg-ink px-4 py-2 text-sm text-paper hover:bg-ink/90">Save</button
				>
			</form>
		{/if}
		<div class="flex gap-4 text-xs">
			<button
				type="button"
				onclick={() => (editingCover = !editingCover)}
				class="text-ink-muted underline underline-offset-2 hover:text-ink"
			>
				{editingCover ? 'Cancel' : 'Use another image'}
			</button>
			{#if movie.coverOverridden && movie.movieId}
				<form method="POST" action="?/setCover" use:enhance>
					<input type="hidden" name="coverUrl" value="" />
					<button type="submit" class="text-ink-muted underline underline-offset-2 hover:text-ink">
						Back to the TMDB poster
					</button>
				</form>
			{/if}
		</div>
	</div>

	<!-- ── Eliminar ─────────────────────────────────────────────────────── -->
	<form
		method="POST"
		action="?/remove"
		bind:this={removeForm}
		class="border-t border-paper-border pt-6"
	>
		<button
			type="button"
			onclick={() => (confirmingRemove = true)}
			class="flex items-center gap-1.5 text-sm text-ink-faint hover:text-red-700"
		>
			<Trash size={15} /> Remove from my movies
		</button>
	</form>

	{#if movie.movieId}
		<TmdbAttribution />
	{/if}
</div>

{#if confirmingRemove}
	<ConfirmDialog
		message="Remove “{movie.title}” ({formatLine(movie.format, movie.edition)}) from your movies?"
		onconfirm={() => {
			confirmingRemove = false;
			removeForm?.requestSubmit();
		}}
		oncancel={() => (confirmingRemove = false)}
	/>
{/if}
