<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft } from 'phosphor-svelte';
	let { form } = $props();
</script>

<div class="mx-auto max-w-md space-y-8">
	<div class="flex items-center gap-3">
		<a href="/groups" class="text-neutral-400 hover:text-neutral-900"><ArrowLeft size={20} /></a>
		<h1 class="font-serif text-2xl font-normal text-neutral-900">Nuevo grupo</h1>
	</div>

	{#if form?.error}
		<p class="border border-neutral-900 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-900">
			{form.error}
		</p>
	{/if}

	<form method="POST" use:enhance class="space-y-5">
		<div>
			<label
				for="name"
				class="block text-xs font-medium tracking-widest text-neutral-500 uppercase"
			>
				Nombre del grupo
			</label>
			<input
				id="name"
				name="name"
				type="text"
				required
				maxlength="60"
				autofocus
				class="mt-1.5 block w-full border-0 border-b border-neutral-300 bg-transparent px-0 py-2 text-sm text-neutral-900 placeholder-neutral-300 focus:border-neutral-900 focus:ring-0"
				placeholder="Club de lectura..."
			/>
		</div>
		<div>
			<label
				for="description"
				class="block text-xs font-medium tracking-widest text-neutral-500 uppercase"
			>
				Descripción <span class="tracking-normal text-neutral-400 normal-case">(opcional)</span>
			</label>
			<textarea
				id="description"
				name="description"
				rows="2"
				class="mt-1.5 w-full border-0 border-b border-neutral-300 bg-transparent px-0 py-2 text-sm text-neutral-900 placeholder-neutral-300 focus:border-neutral-900 focus:ring-0"
				placeholder="Una breve descripción..."
			></textarea>
		</div>
		<div class="pt-2">
			<button
				type="submit"
				class="w-full border border-neutral-900 bg-neutral-900 py-2.5 text-sm text-white hover:bg-neutral-800"
			>
				Crear grupo
			</button>
		</div>
	</form>
</div>
