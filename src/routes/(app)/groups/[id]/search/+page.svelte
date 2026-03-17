<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { ArrowLeft, MagnifyingGlass, Tag } from 'phosphor-svelte';

	let { data, form } = $props();
	let { group, sharedTagsList, results, query, tagId, currentUserId } = $derived(data);

	let searchQuery = $state(query);
	let selectedTagId = $state(tagId);

	function applyFilters() {
		const params = new URLSearchParams();
		if (searchQuery.trim()) params.set('q', searchQuery.trim());
		if (selectedTagId) params.set('tag', selectedTagId);
		goto(`?${params.toString()}`, { replaceState: true });
	}
</script>

<div class="mx-auto max-w-2xl space-y-8">
	<div>
		<a
			href="/groups/{group.id}"
			class="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-900"
		>
			<ArrowLeft size={16} />
			{group.name}
		</a>
		<h1 class="mt-2 font-serif text-2xl font-normal text-neutral-900">Buscar libros</h1>
	</div>

	{#if form?.loanError}
		<p class="border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{form.loanError}</p>
	{/if}
	{#if form?.loanId}
		<p class="border border-neutral-900 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-900">
			Solicitud enviada. <a href="/loans/{form.loanId}" class="underline underline-offset-2"
				>Ver préstamo →</a
			>
		</p>
	{/if}

	<!-- Buscador -->
	<div class="flex gap-2">
		<div class="relative min-w-0 flex-1">
			<MagnifyingGlass
				size={16}
				class="absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400"
			/>
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Título, autor o propietario..."
				onkeydown={(e) => e.key === 'Enter' && applyFilters()}
				class="w-full border border-neutral-200 py-2 pr-4 pl-9 text-sm focus:border-neutral-900 focus:ring-0"
			/>
		</div>
		<button
			onclick={applyFilters}
			class="border border-neutral-900 bg-neutral-900 px-5 py-2 text-sm text-white hover:bg-neutral-800"
		>
			Buscar
		</button>
	</div>

	<!-- Filtro por etiqueta -->
	{#if sharedTagsList.length > 0}
		<div class="flex flex-wrap items-center gap-2">
			<Tag size={14} class="text-neutral-400" />
			{#each sharedTagsList as st (st.sharedTagId)}
				<button
					onclick={() => {
						selectedTagId = selectedTagId === st.tagId ? null : st.tagId;
						applyFilters();
					}}
					class="border px-3 py-0.5 text-xs transition-colors
					{selectedTagId === st.tagId
						? 'border-neutral-900 bg-neutral-900 text-white'
						: 'border-neutral-200 text-neutral-500 hover:border-neutral-400'}"
					style={st.tagColor && selectedTagId !== st.tagId
						? `border-color: ${st.tagColor}44; color: ${st.tagColor}`
						: ''}
				>
					{st.tagName} <span class="opacity-50">({st.bookCount})</span>
				</button>
			{/each}
			{#if selectedTagId}
				<button
					onclick={() => {
						selectedTagId = null;
						applyFilters();
					}}
					class="text-xs text-neutral-400 hover:text-neutral-700"
				>
					limpiar ×
				</button>
			{/if}
		</div>
	{/if}

	<!-- Resultados -->
	{#if sharedTagsList.length === 0}
		<div class="flex flex-col items-center py-20 text-center">
			<p class="text-sm text-neutral-400">Ningún miembro ha compartido etiquetas en este grupo.</p>
			<a
				href="/groups/{group.id}"
				class="mt-3 text-sm text-neutral-900 underline underline-offset-2"
			>
				Gestionar etiquetas
			</a>
		</div>
	{:else if results.length === 0}
		<p class="py-12 text-center text-sm text-neutral-300">
			{query || tagId
				? 'Sin resultados para los filtros actuales.'
				: 'Los libros compartidos aparecerán aquí.'}
		</p>
	{:else}
		<div class="space-y-1">
			<p class="text-xs text-neutral-400">
				{results.length}
				{results.length === 1 ? 'libro' : 'libros'}
			</p>
			<ul class="divide-y divide-neutral-100">
				{#each results as book (book.userBookId)}
					<li class="flex items-center gap-4 py-4">
						{#if book.coverUrl}
							<img
								src={book.coverUrl}
								alt={book.title}
								class="h-16 w-11 flex-shrink-0 object-cover"
							/>
						{:else}
							<div
								class="flex h-16 w-11 flex-shrink-0 items-center justify-center bg-neutral-100 font-serif text-xs text-neutral-300"
							>
								?
							</div>
						{/if}
						<div class="min-w-0 flex-1">
							<p class="font-medium text-neutral-900">{book.title}</p>
							{#if book.authors.length > 0}
								<p class="truncate text-xs text-neutral-400">{book.authors.join(', ')}</p>
							{/if}
							<div class="mt-1.5 flex flex-wrap items-center gap-2">
								<span class="text-xs text-neutral-400">de {book.ownerName}</span>
								{#each book.tags as tag (tag.id)}
									<span
										class="border px-2 py-0.5 text-xs"
										style={tag.color
											? `border-color: ${tag.color}44; color: ${tag.color}`
											: 'border-color: #e5e5e5; color: #737373'}
									>
										{tag.name}
									</span>
								{/each}
							</div>
						</div>
						<div class="flex shrink-0 flex-col items-end gap-2">
							{#if book.isAvailable}
								<span class="text-xs text-neutral-400">disponible</span>
								{#if book.ownerId !== currentUserId}
									<form method="POST" action="?/requestLoan" use:enhance class="inline">
										<input type="hidden" name="userBookId" value={book.userBookId} />
										<button
											type="submit"
											class="border border-neutral-900 bg-neutral-900 px-3 py-1 text-xs text-white hover:bg-neutral-800"
										>
											Solicitar
										</button>
									</form>
								{/if}
							{:else}
								<span class="text-xs text-neutral-300">prestado</span>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
