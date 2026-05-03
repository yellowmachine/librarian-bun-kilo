<script lang="ts">
	type Size = 'sm' | 'md' | 'lg';

	interface Props {
		size?: Size;
		class?: string;
	}

	let { size = 'md', class: className = '' }: Props = $props();

	const dimensions: Record<Size, number> = { sm: 14, md: 18, lg: 24 };
	const strokes: Record<Size, number> = { sm: 2, md: 2, lg: 2.5 };

	const px = $derived(dimensions[size]);
	const sw = $derived(strokes[size]);
	const r = $derived((px - sw * 2) / 2);
	const cx = $derived(px / 2);
	const circumference = $derived(2 * Math.PI * r);
	const dash = $derived(circumference * 0.7);
	const gap = $derived(circumference - dash);
</script>

<svg
	width={px}
	height={px}
	viewBox="0 0 {px} {px}"
	fill="none"
	class="animate-spin {className}"
	aria-hidden="true"
>
	<!-- Track -->
	<circle {cx} cy={cx} {r} stroke="currentColor" stroke-width={sw} class="opacity-20" />
	<!-- Arc -->
	<circle
		{cx}
		cy={cx}
		{r}
		stroke="currentColor"
		stroke-width={sw}
		stroke-linecap="round"
		stroke-dasharray="{dash} {gap}"
		stroke-dashoffset={circumference * 0.25}
		transform="rotate(-90 {cx} {cx})"
	/>
</svg>
