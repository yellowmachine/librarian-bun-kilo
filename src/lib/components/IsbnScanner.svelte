<script module lang="ts">
	// Quagga es un singleton y su stop() es asíncrono (libera la cámara). Si se
	// vuelve a escanear antes de que termine, el nuevo init compite con esa
	// liberación y falla. Se comparte entre instancias para esperarla.
	let releasing: Promise<void> | null = null;

	/** Resuelve cuando la cámara del lector en vivo está liberada (p. ej. antes de usar Quagga sobre una foto). */
	export function scannerReleased(): Promise<void> {
		return releasing ?? Promise.resolve();
	}
</script>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	interface Props {
		onDetected: (isbn: string) => void;
		onError?: (msg: string) => void;
		onCancel?: () => void;
		/** Si se pasa, se ofrece hacer una foto cuando el lector en vivo no lo lee. */
		onPhoto?: (file: File) => void;
	}

	let { onDetected, onError, onCancel, onPhoto }: Props = $props();

	let photoInput = $state<HTMLInputElement | null>(null);

	// La cámara del sistema no debe competir con la del lector en vivo: se
	// para antes de abrirla y, si el usuario cancela la foto, se vuelve a arrancar.
	function takePhoto() {
		stop();
		photoInput?.click();
	}

	function restart() {
		finished = false;
		lastCode = '';
		detectionCount = 0;
		start();
	}

	function onPhotoSelected(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file && onPhoto) onPhoto(file);
		else restart();
	}

	let viewportEl: HTMLDivElement;
	let running = $state(false);
	let errorMsg = $state('');
	let lastCode = '';
	let detectionCount = 0;
	// Una vez confirmado un código (o desmontado el componente) se ignora todo
	// lo que siga llegando: Quagga aún puede emitir frames ya en vuelo.
	let finished = false;

	const CONFIRM_THRESHOLD = 3;

	// Quagga se importa de forma dinámica para evitar que SSR lo evalúe.
	// El módulo accede a `navigator` y `window` en el nivel de módulo.
	let QuaggaInstance: typeof import('@ericblade/quagga2').default | null = null;

	function handleDetected(result: { codeResult?: { code?: string | null } }) {
		if (finished) return;
		const code = result?.codeResult?.code ?? '';
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
	}

	async function start() {
		if (!browser) return;
		errorMsg = '';

		try {
			// Import dinámico — solo se ejecuta en el cliente
			const mod = await import('@ericblade/quagga2');
			if (releasing) await releasing;
			if (finished) return;
			QuaggaInstance = mod.default;

			// Los handlers de Quagga son globales y stop() no los quita: se
			// registra el de esta instancia y se elimina en stop().
			QuaggaInstance.onDetected(handleDetected);

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
					if (finished) return;
					if (err) {
						const msg = err instanceof Error ? err.message : String(err);
						errorMsg = `Could not access the camera: ${msg}`;
						stop();
						onError?.(errorMsg);
						return;
					}
					QuaggaInstance!.start();
					running = true;
				}
			);
		} catch (e) {
			if (finished) return;
			const msg = e instanceof Error ? e.message : String(e);
			errorMsg = `Error starting scanner: ${msg}`;
			stop();
			onError?.(errorMsg);
		}
	}

	function stop() {
		if (finished) return;
		finished = true;
		running = false;
		if (QuaggaInstance) {
			QuaggaInstance.offDetected(handleDetected);
			// Se para aunque init no haya terminado: así no queda una cámara
			// abierta en segundo plano tras salir de la pantalla.
			const release: Promise<void> = Promise.resolve(QuaggaInstance.stop())
				.catch(() => {})
				.then(() => {
					if (releasing === release) releasing = null;
				});
			releasing = release;
		}
	}

	onMount(() => start());
	onDestroy(() => stop());
</script>

<div class="space-y-4">
	{#if errorMsg}
		<p class="border border-ink bg-paper-ui px-4 py-3 text-sm text-ink">
			{errorMsg}
		</p>
	{/if}

	<!-- Viewport de la cámara -->
	<div
		bind:this={viewportEl}
		class="relative overflow-hidden bg-ink"
		style="aspect-ratio: 4/3; max-height: 70svh;"
	>
		{#if !running && !errorMsg}
			<div class="flex h-full items-center justify-center">
				<span class="text-sm text-ink-muted">Iniciando cámara...</span>
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
		<p class="text-center text-xs text-ink-faint">Centra el código de barras en el marco</p>
		{#if onPhoto}
			<button type="button" onclick={takePhoto} class="w-full border btn-secondary py-2.5 text-sm">
				Can't read it? Take a photo
			</button>
		{/if}
		<button
			type="button"
			onclick={() => {
				stop();
				onCancel?.();
			}}
			class="w-full border btn-secondary py-2.5 text-sm"
		>
			Cancel
		</button>
	{/if}

	{#if onPhoto}
		<input
			bind:this={photoInput}
			type="file"
			accept="image/*"
			capture="environment"
			class="hidden"
			onchange={onPhotoSelected}
			oncancel={restart}
		/>
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
