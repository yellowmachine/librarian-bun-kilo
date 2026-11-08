<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Sparkle, Trash } from 'phosphor-svelte';
	import TagCombobox from '$lib/components/TagCombobox.svelte';
	import { readableTagTextColor } from '$lib/tagColor';
	import Spinner from '$lib/components/Spinner.svelte';
	import { resizeImageFile } from '$lib/image';
	import BookCard from '$lib/components/BookCard.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import TmdbAttribution from '$lib/components/TmdbAttribution.svelte';
	import { MEDIA_FORMATS, MEDIA_FORMAT_LABELS, formatLine } from '$lib/mediaFormat';

	let { data, form } = $props();
	const { movie, userLibraries, userTags, hasAiKey } = $derived(data);

	// ── Etiquetas ─────────────────────────────────────────────────────────────
	const assignedTagIds = $derived(new Set(movie.tags.map((t) => t.id)));
	const availableTags = $derived(userTags.filter((t) => !assignedTagIds.has(t.id)));

	let suggesting = $state(false);
	let suggestion = $state<{ tagIds: string[]; newTags: string[] } | null>(null);
	// Lo sugerido que aún no tiene: las existentes que falten y las nuevas
	const suggestedExisting = $derived(
		(suggestion?.tagIds ?? [])
			.filter((id) => !assignedTagIds.has(id))
			.map((id) => userTags.find((t) => t.id === id))
			.filter((t) => t !== undefined)
	);
	const suggestedNew = $derived(
		(suggestion?.newTags ?? []).filter(
			(name) => !movie.tags.some((t) => t.name.toLowerCase() === name.toLowerCase())
		)
	);

	async function suggestTags() {
		suggesting = true;
		try {
			const res = await fetch('/api/movies/suggest-tags', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ userMovieId: movie.userMovieId })
			});
			suggestion = res.ok ? await res.json() : { tagIds: [], newTags: [] };
		} catch {
			suggestion = { tagIds: [], newTags: [] };
		} finally {
			suggesting = false;
		}
	}

	let confirmingRemove = $state(false);

	// ── Foto propia de la carátula ────────────────────────────────────────────
	let photoInput = $state<HTMLInputElement>();
	let uploadingPhoto = $state(false);
	let photoError = $state('');

	async function onPhotoSelected(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		uploadingPhoto = true;
		photoError = '';
		try {
			const image = await resizeImageFile(file, 800, 0.82);
			const res = await fetch(`/api/movies/${movie.userMovieId}/cover`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ image })
			});
			if (!res.ok) {
				photoError =
					(await res.json().catch(() => null))?.message ?? 'The photo could not be saved.';
				return;
			}
			await invalidateAll();
		} catch {
			photoError = 'The photo could not be saved.';
		} finally {
			uploadingPhoto = false;
		}
	}
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

	<!-- ── Etiquetas ────────────────────────────────────────────────────── -->
	<div class="space-y-3">
		<div class="flex items-center gap-3">
			<span class={labelClass}>Tags</span>
			{#if hasAiKey}
				<button
					type="button"
					onclick={suggestTags}
					disabled={suggesting}
					class="flex items-center gap-1 text-xs text-ink-faint underline underline-offset-2 hover:text-ink"
				>
					{#if suggesting}<Spinner size="sm" />{:else}<Sparkle size={12} />{/if}
					Suggest
				</button>
			{/if}
		</div>

		{#if suggestion}
			{#if suggestedExisting.length === 0 && suggestedNew.length === 0}
				<p class="text-xs text-ink-faint">No new tag suggestions.</p>
			{:else}
				<form
					method="POST"
					action="?/applyTags"
					use:enhance={() =>
						async ({ update }) => {
							await update();
							suggestion = null;
						}}
					class="flex flex-wrap items-center gap-2 border border-dashed border-paper-border px-3 py-2"
				>
					<Sparkle size={12} class="text-ink-faint" />
					{#each suggestedExisting as tag (tag.id)}
						<input type="hidden" name="tagId" value={tag.id} />
						<span class="text-xs text-ink-muted">{tag.name}</span>
					{/each}
					{#each suggestedNew as name (name)}
						<input type="hidden" name="newTag" value={name} />
						<span class="text-xs text-ink-muted">+ {name}</span>
					{/each}
					<button type="submit" class="ml-auto text-xs text-ink hover:underline">Add all</button>
					<button
						type="button"
						onclick={() => (suggestion = null)}
						class="text-xs text-ink-faint hover:text-ink"
					>
						Dismiss
					</button>
				</form>
			{/if}
		{/if}

		{#if movie.tags.length > 0}
			<div class="flex flex-wrap gap-2">
				{#each movie.tags as tag (tag.id)}
					<form method="POST" action="?/removeTag" use:enhance class="inline">
						<input type="hidden" name="tagId" value={tag.id} />
						<button
							type="submit"
							title="Remove tag"
							class="group flex items-center gap-1.5 border px-3 py-1 text-xs transition-colors hover:border-red-200 hover:text-red-500"
							style={tag.color
								? `border-color: ${tag.color}44; color: ${readableTagTextColor(tag.color)}`
								: 'border-color: #e8e2da; color: #3d3d3d'}
						>
							{tag.name}
							<span class="opacity-0 group-hover:opacity-100">×</span>
						</button>
					</form>
				{/each}
			</div>
		{/if}

		<TagCombobox {availableTags} />
		<p class="text-xs text-ink-faint">
			Tags shared with a group show this movie to its members, like your books.
		</p>
	</div>

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
					placeholder="https://..."
					class="min-w-0 flex-1 border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
				/>
				<button
					type="submit"
					class="border border-ink bg-ink px-4 py-2 text-sm text-paper hover:bg-ink/90">Save</button
				>
			</form>
		{/if}
		<input
			bind:this={photoInput}
			type="file"
			accept="image/*"
			capture="environment"
			class="hidden"
			onchange={onPhotoSelected}
		/>
		{#if photoError}<p class="text-xs text-red-700">{photoError}</p>{/if}
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
			<button
				type="button"
				onclick={() => photoInput?.click()}
				disabled={uploadingPhoto}
				class="flex items-center gap-1.5 text-ink-muted underline underline-offset-2 hover:text-ink"
			>
				{#if uploadingPhoto}<Spinner size="sm" />{/if}
				Photo of my copy
			</button>
			<button
				type="button"
				onclick={() => (editingCover = !editingCover)}
				class="text-ink-muted underline underline-offset-2 hover:text-ink"
			>
				{editingCover ? 'Cancel' : 'Image from a URL'}
			</button>
			{#if movie.coverOverridden}
				<form method="POST" action="?/setCover" use:enhance>
					<input type="hidden" name="coverUrl" value="" />
					<button type="submit" class="text-ink-muted underline underline-offset-2 hover:text-ink">
						{movie.movieId ? 'Back to the TMDB poster' : 'Remove cover'}
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
