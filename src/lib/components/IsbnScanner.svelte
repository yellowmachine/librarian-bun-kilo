<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	interface Props {
		onDetected: (isbn: string) => void;
		onError?: (msg: string) => void;
	}

	let { onDetected, onError }: Props = $props();

	let viewportEl: HTMLDivElement;
	let running = $state(false);
	let errorMsg = $state('');
	let lastCode = $state('');
	let detectionCount = $state(0);

	const CONFIRM_THRESHOLD = 3;

	// Quagga se importa de forma dinámica para evitar que SSR lo evalúe.
	// El módulo accede a `navigator` y `window` en el nivel de módulo.
	let QuaggaInstance: typeof import('@ericblade/quagga2').default | null = null;

	async function start() {
		if (!browser) return;
		errorMsg = '';

		try {
			// Import dinámico — solo se ejecuta en el cliente
			const mod = await import('@ericblade/quagga2');
			QuaggaInstance = mod.default;

			await QuaggaInstance.init(
				{
					inputStream: {
						type: 'LiveStream',
						target: viewportEl,
						constraints: {
							// 'environment' = cámara trasera en móvil.
							// En una PWA instalada esto activa la cámara nativa directamente.
							facingMode: { ideal: 'environment' },
							width: { ideal: 1280 },
							height: { ideal: 720 }
						}
					},
					decoder: {
						readers: ['ean_reader', 'ean_8_reader', 'upc_reader', 'upc_e_reader']
					},
					locate: true,
					frequency: 10
				},
				(err: unknown) => {
					if (err) {
						const msg = err instanceof Error ? err.message : String(err);
						errorMsg = `No se pudo acceder a la cámara: ${msg}`;
						onError?.(errorMsg);
						return;
					}
					QuaggaInstance!.start();
					running = true;
				}
			);

			QuaggaInstance.onDetected((result: any) => {
				const code: string = result?.codeResult?.code ?? '';
				if (!code) return;

				if (code === lastCode) {
					detectionCount++;
				} else {
					lastCode = code;
					detectionCount = 1;
				}

				if (detectionCount >= CONFIRM_THRESHOLD) {
					stop();
					onDetected(code);
				}
			});
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			errorMsg = `Error al iniciar escáner: ${msg}`;
			onError?.(errorMsg);
		}
	}

	function stop() {
		if (running && QuaggaInstance) {
			QuaggaInstance.stop();
			running = false;
		}
	}

	onMount(() => start());
	onDestroy(() => stop());
</script>

<div class="space-y-4">
	{#if errorMsg}
		<p class="border border-neutral-900 bg-neutral-50 px-4 py-3 text-sm text-neutral-900">
			{errorMsg}
		</p>
	{/if}

	<!-- Viewport de la cámara -->
	<div
		bind:this={viewportEl}
		class="relative overflow-hidden bg-neutral-900"
		style="aspect-ratio: 4/3; max-height: 70svh;"
	>
		{#if !running && !errorMsg}
			<div class="flex h-full items-center justify-center">
				<span class="text-sm text-neutral-500">Iniciando cámara...</span>
			</div>
		{/if}

		{#if running}
			<!-- Marco guía de escaneo -->
			<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
				<!-- Esquinas del marco -->
				<div class="relative h-24 w-64">
					<!-- Superior izquierda -->
					<div class="absolute top-0 left-0 h-6 w-6 border-t-2 border-l-2 border-white"></div>
					<!-- Superior derecha -->
					<div class="absolute top-0 right-0 h-6 w-6 border-t-2 border-r-2 border-white"></div>
					<!-- Inferior izquierda -->
					<div class="absolute bottom-0 left-0 h-6 w-6 border-b-2 border-l-2 border-white"></div>
					<!-- Inferior derecha -->
					<div class="absolute right-0 bottom-0 h-6 w-6 border-r-2 border-b-2 border-white"></div>
					<!-- Línea de escaneo animada -->
					<div class="scan-line absolute inset-x-0 h-0.5 bg-white opacity-80"></div>
				</div>
			</div>
		{/if}
	</div>

	{#if running}
		<p class="text-center text-xs text-neutral-400">Centra el código de barras en el marco</p>
		<button
			type="button"
			onclick={stop}
			class="w-full border border-neutral-200 py-2.5 text-sm text-neutral-600 hover:border-neutral-400"
		>
			Cancelar
		</button>
	{/if}
</div>

<style>
	/* Animación de la línea de escaneo */
	@keyframes scan {
		0% {
			top: 10%;
		}
		50% {
			top: 85%;
		}
		100% {
			top: 10%;
		}
	}

	.scan-line {
		animation: scan 2s ease-in-out infinite;
	}
</style>
