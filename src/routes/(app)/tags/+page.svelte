<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft, PencilSimple, Check, X } from 'phosphor-svelte';

	let { data } = $props();
	let { tags } = $derived(data);

	let editing = $state<string | null>(null);
	let editName = $state('');
	let editColor = $state('');

	function startEdit(tag: { id: string; name: string; color: string | null }) {
		editing = tag.id;
		editName = tag.name;
		editColor = tag.color ?? '#0a0a0a';
	}

	function cancelEdit() {
		editing = null;
	}
</script>

<div class="mx-auto max-w-2xl space-y-8">
	<div>
		<a href="/library" class="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink">
			<ArrowLeft size={16} /> Library
		</a>
		<h1 class="mt-3 font-serif text-3xl font-normal text-ink">Tags</h1>
	</div>

	{#if tags.length === 0}
		<p class="py-8 text-center text-sm text-ink-faint">No tags yet.</p>
	{:else}
		<ul class="divide-y divide-paper-border">
			{#each tags as tag (tag.id)}
				<li class="flex items-center gap-3 py-3">
					{#if editing === tag.id}
						<form
							method="POST"
							action="?/update"
							use:enhance={() => async ({ update }) => {
								editing = null;
								await update();
							}}
							class="flex flex-1 items-center gap-3"
						>
							<input type="hidden" name="id" value={tag.id} />
							<input type="color" name="color" bind:value={editColor} class="h-6 w-6 cursor-pointer rounded-none border-0 bg-transparent p-0" />
							<input
								type="text"
								name="name"
								bind:value={editName}
								class="flex-1 border-b border-ink bg-transparent text-sm text-ink outline-none"
								autofocus
								onkeydown={(e) => e.key === 'Escape' && cancelEdit()}
							/>
							<button type="submit" class="text-ink-faint hover:text-ink">
								<Check size={16} />
							</button>
							<button type="button" onclick={cancelEdit} class="text-ink-faint hover:text-ink">
								<X size={16} />
							</button>
						</form>
					{:else}
						<span
							class="border px-3 py-0.5 text-xs"
							style={tag.color
								? `border-color: ${tag.color}44; color: ${tag.color}`
								: 'border-color: #e8e2da; color: #3d3d3d'}
						>
							{tag.name}
						</span>
						<span class="text-xs text-ink-faint">{tag.bookCount} {tag.bookCount === 1 ? 'book' : 'books'}</span>
						<button
							type="button"
							onclick={() => startEdit(tag)}
							class="ml-auto text-ink-faint hover:text-ink"
						>
							<PencilSimple size={14} />
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
