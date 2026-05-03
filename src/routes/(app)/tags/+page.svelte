<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { ArrowLeft, PencilSimple, Check, X, Trash, Plus } from 'phosphor-svelte';

	let { data } = $props();
	let { tags } = $derived(data);

	let editing = $state<string | null>(null);
	let editName = $state('');
	let editColor = $state('');

	// Confirmación de borrado inline
	let confirmingDelete = $state<string | null>(null);

	// Formulario de creación
	let newName = $state('');
	let newColor = $state('#0a0a0a');
	let creating = $state(false);

	function startEdit(tag: { id: string; name: string; color: string | null }) {
		confirmingDelete = null;
		editing = tag.id;
		editName = tag.name;
		editColor = tag.color ?? '#0a0a0a';
	}

	function cancelEdit() {
		editing = null;
	}

	function requestDelete(tag: { id: string; bookCount: number; groupCount: number }) {
		editing = null;
		// Si el tag no está en uso, no hace falta confirmación
		if (tag.bookCount === 0 && tag.groupCount === 0) {
			confirmingDelete = '__direct__' + tag.id;
		} else {
			confirmingDelete = tag.id;
		}
	}

	function cancelDelete() {
		confirmingDelete = null;
	}

	function isDirect(tagId: string) {
		return confirmingDelete === '__direct__' + tagId;
	}

	function isConfirming(tagId: string) {
		return confirmingDelete === tagId;
	}
</script>

<div class="mx-auto max-w-2xl space-y-8">
	<div>
		<a
			href={resolve('/library')}
			class="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink"
		>
			<ArrowLeft size={16} /> Library
		</a>
		<h1 class="mt-3 font-serif text-2xl font-normal text-ink sm:text-3xl">Tags</h1>
	</div>

	<!-- Crear tag -->
	{#if creating}
		<form
			method="POST"
			action="?/create"
			use:enhance={() =>
				async ({ update }) => {
					await update();
					newName = '';
					newColor = '#0a0a0a';
					creating = false;
				}}
			class="flex items-center gap-3 border border-paper-border px-4 py-3"
		>
			<input
				type="color"
				name="color"
				bind:value={newColor}
				class="h-6 w-6 cursor-pointer rounded-none border-0 bg-transparent p-0"
			/>
			<input
				type="text"
				name="name"
				bind:value={newName}
				placeholder="Tag name..."
				autofocus
				class="flex-1 border-b border-ink bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
				onkeydown={(e) => e.key === 'Escape' && (creating = false)}
			/>
			<button type="submit" class="text-ink-faint hover:text-ink" aria-label="Save">
				<Check size={16} />
			</button>
			<button
				type="button"
				onclick={() => (creating = false)}
				class="text-ink-faint hover:text-ink"
				aria-label="Cancel"
			>
				<X size={16} />
			</button>
		</form>
	{:else}
		<button
			onclick={() => (creating = true)}
			class="flex items-center gap-2 text-sm text-ink-faint hover:text-ink"
		>
			<Plus size={16} /> New tag
		</button>
	{/if}

	{#if tags.length === 0}
		<p class="py-8 text-center text-sm text-ink-faint">No tags yet.</p>
	{:else}
		<ul class="divide-y divide-paper-border">
			{#each tags as tag (tag.id)}
				<li class="py-3">
					{#if editing === tag.id}
						<!-- Edición inline -->
						<form
							method="POST"
							action="?/update"
							use:enhance={() =>
								async ({ update }) => {
									editing = null;
									await update();
								}}
							class="flex items-center gap-3"
						>
							<input type="hidden" name="id" value={tag.id} />
							<input
								type="color"
								name="color"
								bind:value={editColor}
								class="h-6 w-6 cursor-pointer rounded-none border-0 bg-transparent p-0"
							/>
							<input
								type="text"
								name="name"
								bind:value={editName}
								class="flex-1 border-b border-ink bg-transparent text-sm text-ink outline-none"
								autofocus
								onkeydown={(e) => e.key === 'Escape' && cancelEdit()}
							/>
							<button type="submit" class="text-ink-faint hover:text-ink" aria-label="Save">
								<Check size={16} />
							</button>
							<button
								type="button"
								onclick={cancelEdit}
								class="text-ink-faint hover:text-ink"
								aria-label="Cancel"
							>
								<X size={16} />
							</button>
						</form>
					{:else if isConfirming(tag.id)}
						<!-- Confirmación de borrado con impacto -->
						<div class="flex items-center gap-3">
							<span
								class="border px-3 py-0.5 text-xs"
								style={tag.color
									? `border-color: ${tag.color}44; color: ${tag.color}`
									: 'border-color: #e8e2da; color: #3d3d3d'}
							>
								{tag.name}
							</span>
							<span class="flex-1 text-xs text-ink-muted">
								Se eliminará de
								{#if tag.bookCount > 0}
									<strong>{tag.bookCount} {tag.bookCount === 1 ? 'book' : 'books'}</strong>
								{/if}
								{#if tag.bookCount > 0 && tag.groupCount > 0}
									and
								{/if}
								{#if tag.groupCount > 0}
									<strong>{tag.groupCount} {tag.groupCount === 1 ? 'group' : 'groups'}</strong>
								{/if}.
							</span>
							<form
								method="POST"
								action="?/delete"
								use:enhance={() =>
									async ({ update }) => {
										confirmingDelete = null;
										await update();
									}}
							>
								<input type="hidden" name="id" value={tag.id} />
								<button
									type="submit"
									class="border border-ink bg-ink px-3 py-1 text-xs text-paper hover:bg-ink/90"
								>
									Confirm
								</button>
							</form>
							<button
								type="button"
								onclick={cancelDelete}
								class="text-ink-faint hover:text-ink"
								aria-label="Cancel"
							>
								<X size={16} />
							</button>
						</div>
					{:else}
						<!-- Vista normal -->
						<div class="flex items-center gap-3">
							<span
								class="border px-3 py-0.5 text-xs"
								style={tag.color
									? `border-color: ${tag.color}44; color: ${tag.color}`
									: 'border-color: #e8e2da; color: #3d3d3d'}
							>
								{tag.name}
							</span>
							<span class="text-xs text-ink-faint">
								{tag.bookCount}
								{tag.bookCount === 1 ? 'book' : 'books'}
								{#if tag.groupCount > 0}
									· {tag.groupCount} {tag.groupCount === 1 ? 'group' : 'groups'}
								{/if}
							</span>
							<div class="ml-auto flex items-center gap-3">
								<button
									type="button"
									onclick={() => startEdit(tag)}
									class="text-ink-faint hover:text-ink"
									aria-label="Edit"
								>
									<PencilSimple size={14} />
								</button>
								{#if isDirect(tag.id)}
									<!-- Borrado directo sin confirmación (tag sin uso) -->
									<form
										method="POST"
										action="?/delete"
										use:enhance={() =>
											async ({ update }) => {
												confirmingDelete = null;
												await update();
											}}
									>
										<input type="hidden" name="id" value={tag.id} />
										<button type="submit" class="text-ink-faint hover:text-ink" aria-label="Delete">
											<Trash size={14} />
										</button>
									</form>
								{:else}
									<button
										type="button"
										onclick={() => requestDelete(tag)}
										class="text-ink-faint hover:text-ink"
										aria-label="Delete"
									>
										<Trash size={14} />
									</button>
								{/if}
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
