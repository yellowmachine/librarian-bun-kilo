<script lang="ts">
	/**
	 * StarRating — muestra y/o permite seleccionar una puntuación de 1 a 5.
	 *
	 * Props:
	 *   value      — puntuación actual (0 = sin puntuar)
	 *   readonly   — solo visualización, sin interacción
	 *   size       — tamaño de cada estrella en px (por defecto 20)
	 *   name       — nombre del campo hidden que se envía en el formulario
	 */

	type Props = {
		value?: number;
		readonly?: boolean;
		size?: number;
		name?: string;
		onchange?: (rating: number) => void;
	};

	let {
		value = $bindable(0),
		readonly = false,
		size = 20,
		name = 'rating',
		onchange
	}: Props = $props();

	let hovered = $state(0);

	function select(star: number) {
		if (readonly) return;
		value = star;
		onchange?.(star);
	}

	function filled(star: number): boolean {
		const active = hovered > 0 ? hovered : value;
		return star <= active;
	}
</script>

<div
	class="flex items-center gap-0.5"
	role={readonly ? 'img' : 'group'}
	aria-label="Puntuación {value} de 5"
>
	{#each [1, 2, 3, 4, 5] as star}
		{#if readonly}
			<svg
				width={size}
				height={size}
				viewBox="0 0 24 24"
				aria-hidden="true"
				class="shrink-0 transition-colors"
				style="color: {filled(star) ? '#f59e0b' : '#d1d5db'}"
			>
				<path
					fill="currentColor"
					d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
				/>
			</svg>
		{:else}
			<button
				type="button"
				onclick={() => select(star)}
				onmouseenter={() => (hovered = star)}
				onmouseleave={() => (hovered = 0)}
				class="shrink-0 cursor-pointer transition-transform hover:scale-110 focus:outline-none"
				aria-label="{star} estrella{star !== 1 ? 's' : ''}"
			>
				<svg
					width={size}
					height={size}
					viewBox="0 0 24 24"
					aria-hidden="true"
					class="transition-colors"
					style="color: {filled(star) ? '#f59e0b' : '#d1d5db'}"
				>
					<path
						fill="currentColor"
						d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
					/>
				</svg>
			</button>
		{/if}
	{/each}

	{#if !readonly}
		<input type="hidden" {name} {value} />
	{/if}
</div>
