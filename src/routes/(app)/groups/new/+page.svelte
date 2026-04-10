<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft } from 'phosphor-svelte';
	let { form } = $props();
</script>

<div class="mx-auto max-w-md space-y-8">
	<div class="flex items-center gap-3">
		<a href="/groups" class="text-ink-faint hover:text-ink"><ArrowLeft size={20} /></a>
		<h1 class="font-serif text-2xl font-normal text-ink">Nuevo grupo</h1>
	</div>

	{#if form?.error}
		<p class="border border-ink bg-paper-ui px-4 py-2.5 text-sm text-ink">
			{form.error}
		</p>
	{/if}

	<form method="POST" use:enhance class="space-y-5">
		<div>
			<label
				for="name"
				class="block text-xs font-medium tracking-widest text-ink-muted uppercase"
			>
				Group name
			</label>
			<input
				id="name"
				name="name"
				type="text"
				required
				maxlength="60"
				autofocus
				class="mt-1.5 block w-full border-0 border-b border-paper-border bg-transparent px-0 py-2 text-sm text-ink placeholder-ink-faint focus:border-ink focus:ring-0"
				placeholder="Club de lectura..."
			/>
		</div>
		<div>
			<label
				for="description"
				class="block text-xs font-medium tracking-widest text-ink-muted uppercase"
			>
				Description <span class="tracking-normal text-ink-faint normal-case">(opcional)</span>
			</label>
			<textarea
				id="description"
				name="description"
				rows="2"
				class="mt-1.5 w-full border-0 border-b border-paper-border bg-transparent px-0 py-2 text-sm text-ink placeholder-ink-faint focus:border-ink focus:ring-0"
				placeholder="Una breve descripción..."
			></textarea>
		</div>
		<div class="pt-2">
			<button
				type="submit"
				class="w-full border border-ink bg-ink py-2.5 text-sm text-paper hover:bg-ink/90"
			>
				Create group
			</button>
		</div>
	</form>
</div>
