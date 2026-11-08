<script lang="ts">
	import type { Snippet } from 'svelte';
	import Caracol from './Caracol.svelte';

	/**
	 * Mientras algo tarda y no se debe tocar nada (la IA leyendo las portadas, una sugerencia, subir
	 * una foto): la pantalla velada, para que lo de detrás no responda a los toques, y el caracol en
	 * el centro, con una línea debajo que dice qué pasa. El mismo recuadro que cuando una página
	 * tarda en abrir (layout raíz). Como Espera.svelte de Seilide, con los colores de librarian.
	 */
	let { children }: { children?: Snippet } = $props();
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-[2px] dark:bg-black/60"
	role="status"
	aria-label="Loading"
	aria-live="polite"
>
	<div
		class="flex max-w-xs flex-col items-center gap-3 rounded-2xl border border-paper-border bg-paper/95 p-5 text-center shadow-lg dark:border-dark-paper-border dark:bg-dark-paper/95"
	>
		<Caracol class="w-20 text-accent dark:text-accent-light" />
		{#if children}
			<p class="text-sm text-ink-muted dark:text-dark-ink-muted">{@render children()}</p>
		{/if}
	</div>
</div>
