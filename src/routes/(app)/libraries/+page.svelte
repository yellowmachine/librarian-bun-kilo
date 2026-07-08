<script lang="ts">
	import { enhance } from '$app/forms';
	import { Plus, BookOpen, ArrowRight, Star } from 'phosphor-svelte';

	let { data, form } = $props();
	const { userLibraries } = data;

	let showCreateForm = $state(false);
	let name = $state('');
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

	<ul class="divide-y divide-paper-border">
		{#each userLibraries as library (library.id)}
			<li>
				<a
					href={`/library?libraryId=${library.id}`}
					class="-mx-2 flex items-center gap-4 px-2 py-4 transition-colors hover:bg-paper-ui"
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
			</li>
		{/each}
	</ul>
</div>
