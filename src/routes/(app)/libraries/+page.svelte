<script lang="ts">
	import { enhance, applyAction, deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Plus, BookOpen, ArrowRight, Star, PencilSimple, Trash } from 'phosphor-svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	let { data, form } = $props();
	const userLibraries = $derived(data.userLibraries);

	let showCreateForm = $state(false);
	let name = $state('');

	let editingId = $state<string | null>(null);
	let editName = $state('');

	function startEdit(library: { id: string; name: string }) {
		editingId = library.id;
		editName = library.name;
	}

	let confirmMessage = $state('');
	let pendingForm = $state<HTMLFormElement | null>(null);

	function openConfirm(message: string, formEl: HTMLFormElement): void {
		confirmMessage = message;
		pendingForm = formEl;
	}

	async function submitConfirmed() {
		if (!pendingForm) return;
		const formEl = pendingForm;
		pendingForm = null;
		const response = await fetch(formEl.action, {
			method: 'POST',
			body: new FormData(formEl),
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await response.text());
		await applyAction(result);
		invalidateAll();
	}
</script>

<div class="space-y-8">
	<div class="flex items-end justify-between">
		<div>
			<h1 class="font-serif text-2xl font-normal text-ink sm:text-3xl">Libraries</h1>
			<p class="mt-1 text-sm text-ink-faint">
				{userLibraries.length}
				{userLibraries.length === 1 ? 'library' : 'libraries'}
			</p>
		</div>
		<button
			onclick={() => (showCreateForm = !showCreateForm)}
			class="flex items-center gap-1.5 border border-ink bg-ink px-4 py-2 text-sm text-paper hover:bg-ink/90"
		>
			<Plus size={16} weight="bold" /> New
		</button>
	</div>

	{#if showCreateForm}
		<div class="border border-paper-border p-5">
			<p class="mb-3 text-xs font-medium tracking-widest text-ink-muted uppercase">New library</p>
			<form
				method="POST"
				action="?/create"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						name = '';
						showCreateForm = false;
					};
				}}
				class="flex gap-2"
			>
				<input
					type="text"
					name="name"
					bind:value={name}
					placeholder="Office"
					autofocus
					maxlength="100"
					class="min-w-0 flex-1 border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
				/>
				<button
					type="submit"
					class="border border-ink bg-ink px-5 py-2 text-sm text-paper hover:bg-ink/90"
				>
					Create
				</button>
			</form>
			{#if form?.createError}
				<p class="mt-2 text-sm text-red-500">{form.createError}</p>
			{/if}
		</div>
	{/if}

	{#if form?.deleteError || form?.setDefaultError}
		<p class="border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
			{form.deleteError ?? form.setDefaultError}
		</p>
	{/if}

	<ul class="divide-y divide-paper-border">
		{#each userLibraries as library (library.id)}
			<li class="flex items-center gap-2 py-2">
				{#if editingId === library.id}
					<form
						method="POST"
						action="?/rename"
						use:enhance={() => {
							return async ({ update }) => {
								await update();
								editingId = null;
							};
						}}
						class="flex flex-1 items-center gap-2"
					>
						<input type="hidden" name="libraryId" value={library.id} />
						<input
							type="text"
							name="name"
							bind:value={editName}
							autofocus
							maxlength="100"
							class="min-w-0 flex-1 border border-paper-border px-3 py-2 text-sm focus:border-ink focus:ring-0"
						/>
						<button
							type="submit"
							class="shrink-0 border border-ink bg-ink px-3 py-2 text-sm text-paper hover:bg-ink/90"
						>
							Save
						</button>
						<button
							type="button"
							onclick={() => (editingId = null)}
							class="shrink-0 text-sm text-ink-faint hover:text-ink-muted"
						>
							Cancel
						</button>
					</form>
				{:else}
					<a
						href={`/library?libraryId=${library.id}`}
						class="-mx-2 flex min-w-0 flex-1 items-center gap-4 px-2 py-2 transition-colors hover:bg-paper-ui"
					>
						<div
							class="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-paper-border bg-paper-ui"
						>
							<BookOpen size={18} weight="regular" class="text-ink-faint" />
						</div>
						<div class="min-w-0 flex-1">
							<p class="flex items-center gap-2 font-medium text-ink">
								{library.name}
								{#if library.isDefault}
									<Star size={12} weight="fill" class="text-ink-faint" />
								{/if}
							</p>
						</div>
						<div class="flex flex-shrink-0 items-center gap-3">
							<span class="text-xs text-ink-faint">
								{library.bookCount}
								{library.bookCount === 1 ? 'book' : 'books'}
							</span>
							<ArrowRight size={16} class="text-ink-faint" />
						</div>
					</a>

					{#if !library.isDefault}
						<form method="POST" action="?/setDefault" use:enhance>
							<input type="hidden" name="libraryId" value={library.id} />
							<button
								type="submit"
								title="Make default"
								class="shrink-0 p-2 text-ink-faint hover:text-ink"
							>
								<Star size={15} />
							</button>
						</form>
					{/if}

					<button
						type="button"
						onclick={() => startEdit(library)}
						title="Rename"
						class="shrink-0 p-2 text-ink-faint hover:text-ink"
					>
						<PencilSimple size={15} />
					</button>

					{#if !library.isDefault && library.bookCount === 0}
						<form
							method="POST"
							action="?/delete"
							onsubmit={(e) => {
								e.preventDefault();
								openConfirm(
									`Delete "${library.name}"? This can't be undone.`,
									e.currentTarget as HTMLFormElement
								);
							}}
						>
							<input type="hidden" name="libraryId" value={library.id} />
							<button
								type="submit"
								title="Delete"
								class="shrink-0 p-2 text-ink-faint hover:text-red-500"
							>
								<Trash size={15} />
							</button>
						</form>
					{/if}
				{/if}
			</li>
		{/each}
	</ul>
</div>

{#if pendingForm}
	<ConfirmDialog
		message={confirmMessage}
		onconfirm={submitConfirmed}
		oncancel={() => {
			pendingForm = null;
		}}
	/>
{/if}
