<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Espera from '$lib/components/Espera.svelte';

	const { Story } = defineMeta({
		title: 'Librarian/Espera',
		component: Espera,
		tags: ['autodocs'],
		parameters: { layout: 'fullscreen' }
	});
</script>

<!-- Sobre una página, para ver el velo -->
<Story name="Con texto">
	{#snippet template()}
		<div class="space-y-3 p-6">
			<h1 class="font-serif text-2xl text-ink">Add movies</h1>
			<p class="text-sm text-ink-muted">What is behind does not answer while the snail is here.</p>
			<button type="button" class="border border-paper-border px-4 py-1.5 text-sm">A button</button>
		</div>
		<Espera>Reading the covers…</Espera>
	{/snippet}
</Story>

<Story name="Sin texto">
	{#snippet template()}
		<Espera />
	{/snippet}
</Story>
