<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import { navigating } from '$app/state';
	import Caracol from '$lib/components/Caracol.svelte';

	let { children } = $props();

	/**
	 * El caracol mientras ir a otra página tarda: `navigating` de SvelteKit
	 * (https://svelte.dev/docs/kit/$app-state#navigating), y solo pasado un momento, para que un
	 * cambio rápido no lo haga parpadear. Como en Seilide.
	 */
	const SLOW_MS = 400;
	let slow = $state(false);
	$effect(() => {
		if (!navigating.to) {
			slow = false;
			return;
		}
		const timer = setTimeout(() => (slow = true), SLOW_MS);
		return () => clearTimeout(timer);
	});

	// Sin <link rel="manifest"> ni service worker el navegador no ofrece instalar la app.
	const webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '';

	onMount(async () => {
		if (!pwaInfo) return;
		const { registerSW } = await import('virtual:pwa-register');
		registerSW({ immediate: true });
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- etiqueta generada por vite-plugin-pwa -->
	{@html webManifestLink}
</svelte:head>
{#if slow}
	<div
		class="pointer-events-none fixed inset-0 z-50 grid place-items-center"
		role="status"
		aria-label="Loading"
	>
		<div
			class="rounded-2xl border border-paper-border bg-paper/95 p-5 shadow-lg dark:border-dark-paper-border dark:bg-dark-paper/95"
		>
			<Caracol class="w-20 text-accent dark:text-accent-light" />
		</div>
	</div>
{/if}
{@render children()}
