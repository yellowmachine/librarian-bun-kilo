<script lang="ts">
	import { onMount } from 'svelte';
	import { DownloadSimple } from 'phosphor-svelte';

	// `beforeinstallprompt` no está en los tipos del DOM: solo lo lanzan los navegadores
	// Chromium (Chrome, Edge, Samsung Internet). Safari y Firefox no lo lanzan nunca,
	// así que en ellos el botón no aparece.
	interface BeforeInstallPromptEvent extends Event {
		prompt(): Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	}

	let installPrompt = $state<BeforeInstallPromptEvent | null>(null);

	onMount(() => {
		// Ya abierta como app instalada: nada que ofrecer.
		if (window.matchMedia('(display-mode: standalone)').matches) return;

		// Si la app ya está instalada, Chromium no lanza el evento: el botón no aparece.
		function onBeforeInstallPrompt(event: Event) {
			// Sin esto Chrome puede mostrar su propia mini-barra de instalación en móvil.
			event.preventDefault();
			installPrompt = event as BeforeInstallPromptEvent;
		}
		function onAppInstalled() {
			installPrompt = null;
		}

		window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
		window.addEventListener('appinstalled', onAppInstalled);
		return () => {
			window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
			window.removeEventListener('appinstalled', onAppInstalled);
		};
	});

	async function install() {
		if (!installPrompt) return;
		const event = installPrompt;
		// El evento solo sirve una vez; si el usuario lo descarta, Chrome lanzará otro más adelante.
		installPrompt = null;
		await event.prompt();
		await event.userChoice;
	}
</script>

{#if installPrompt}
	<button
		type="button"
		onclick={install}
		title="Install Librarian as an app"
		class="flex items-center gap-1 rounded-md border border-paper-border px-2 py-1 text-xs text-ink-faint transition-colors hover:bg-paper-ui hover:text-ink"
	>
		<DownloadSimple size={13} />
		<span class="hidden md:inline">Install</span>
		<span class="sr-only md:hidden">Install Librarian as an app</span>
	</button>
{/if}
