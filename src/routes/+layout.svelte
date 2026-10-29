<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { pwaInfo } from 'virtual:pwa-info';

	let { children } = $props();

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
{@render children()}
